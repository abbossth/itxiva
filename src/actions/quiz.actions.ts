"use server";

import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";
import { Quiz, IQuizQuestion, IQuizData } from "@/lib/db/models/quiz.model";
import { QuizSubmission, IQuizAnswer, IQuizSubmissionData } from "@/lib/db/models/quiz-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireAuth, requireMentor, requireStudent, requireGroupAccess } from "@/lib/auth/guards";
import { quizUpsertSchema, quizSubmitSchema, quizGradeSchema } from "@/lib/validations/quiz.schema";
import { autoGradeQuiz, isAutoOpenQuestion } from "@/lib/grading";
import { aiGradePending, aiGradeQuizSubmission, pendingAiAnswers } from "@/lib/auto-grade";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { notifyGroup } from "@/lib/notifications/notify";
import { rewardQuizAnswers } from "@/lib/gamification/quiz-rewards";

export type ActionState<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

/**
 * Get quiz for a lesson (for student view or lesson page)
 * If role is student, correctAnswers are stripped unless submitted and graded
 */
export async function getQuizForLesson(lessonId: string): Promise<ActionState<{
  quiz: IQuizData | null;
  submission: IQuizSubmissionData | null;
}>> {
  try {
    const user = await requireAuth();
    if (typeof lessonId !== "string" || !mongoose.isValidObjectId(lessonId)) {
      return { success: false, error: "Dars topilmadi" };
    }
    await connectDB();

    const lesson = await Lesson.findById(lessonId).lean();
    if (!lesson) {
      return { success: false, error: "Dars topilmadi" };
    }

    if (user.role === "student") {
      await requireGroupAccess(lesson.groupId.toString());
      if (!lesson.isPublished) {
        return { success: false, error: "Dars hali nashr etilmagan" };
      }
    }

    const quizDoc = await Quiz.findOne({ lessonId, isPublished: true }).lean();
    if (!quizDoc) {
      return { success: true, data: { quiz: null, submission: null } };
    }

    let submissionDoc: IQuizSubmissionData | null = null;
    if (user.role === "student") {
      submissionDoc = (await QuizSubmission.findOne({
        quizId: quizDoc._id,
        studentId: user.userId,
      }).lean()) as unknown as IQuizSubmissionData | null;
    }

    // To'g'ri javob va izoh faqat baholangan va o'quvchi javob bergan savollarda ochiladi:
    // topshirilgandan keyin qo'shilgan savollarga hali javob berish mumkin
    const isGraded = submissionDoc?.status === "graded";
    const answeredIds = new Set((submissionDoc?.answers ?? []).map((a) => a.questionId));
    const questions: IQuizQuestion[] = quizDoc.questions.map((q) => {
      const reveal = user.role === "mentor" || (isGraded && answeredIds.has(String(q._id)));
      return {
        _id: q._id?.toString(),
        type: q.type,
        prompt: q.prompt,
        options: q.options || [],
        correctAnswers: reveal ? q.correctAnswers : [],
        points: q.points,
        explanation: reveal ? q.explanation : undefined,
      };
    });

    const quizData: IQuizData = {
      _id: quizDoc._id.toString(),
      lessonId: quizDoc.lessonId.toString(),
      title: quizDoc.title,
      description: quizDoc.description,
      questions,
      isPublished: quizDoc.isPublished,
      passingScore: quizDoc.passingScore,
      createdAt: quizDoc.createdAt?.toString(),
      updatedAt: quizDoc.updatedAt?.toString(),
    };

    return {
      success: true,
      data: {
        quiz: quizData,
        submission: submissionDoc
          ? {
              ...submissionDoc,
              _id: submissionDoc._id.toString(),
              quizId: submissionDoc.quizId.toString(),
              lessonId: submissionDoc.lessonId.toString(),
              studentId: submissionDoc.studentId.toString(),
            }
          : null,
      },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Xatolik yuz berdi";
    return { success: false, error: message };
  }
}

/**
 * Submit quiz answers by student
 */
export async function submitQuizAction(
  data: unknown
): Promise<
  ActionState<{ totalScore: number; maxScore: number; status: string; answers: IQuizAnswer[] }>
> {
  try {
    const user = await requireStudent();
    const parsed = quizSubmitSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    if (!mongoose.isValidObjectId(parsed.data.quizId)) {
      return { success: false, error: "Test topilmadi yoki faol emas" };
    }
    await connectDB();
    const quiz = await Quiz.findById(parsed.data.quizId);
    if (!quiz || !quiz.isPublished) {
      return { success: false, error: "Test topilmadi yoki faol emas" };
    }

    const lesson = await Lesson.findById(quiz.lessonId);
    if (!lesson) {
      return { success: false, error: "Dars topilmadi" };
    }

    await requireGroupAccess(lesson.groupId.toString());
    if (!lesson.isPublished) {
      return { success: false, error: "Dars hali nashr etilmagan" };
    }

    // Test faqat bir marta topshiriladi (natijada to'g'ri javoblar ko'rsatilgani uchun).
    // Topshirilgandan keyin mentor savol qo'shgan bo'lsa — faqat shu yangi savollarga javob qabul qilinadi.
    const existing = await QuizSubmission.findOne({ quizId: quiz._id, studentId: user.userId }).lean();
    const answeredIds = new Set((existing?.answers ?? []).map((a) => a.questionId));
    const questions = existing ? quiz.questions.filter((q) => !answeredIds.has(String(q._id))) : quiz.questions;
    if (existing && questions.length === 0) {
      return { success: false, error: "Siz bu testni allaqachon topshirgansiz" };
    }

    // Auto-grade
    const graded = autoGradeQuiz({
      questions,
      submittedAnswers: parsed.data.answers,
    });
    const { hasOpenEnded } = graded;

    let submission: { _id: mongoose.Types.ObjectId; answers: IQuizAnswer[]; totalScore: number; maxScore: number; status: string };
    if (existing) {
      // Shartli yangilash: ikki marta bosilsa ham yangi savollar bir marta qo'shiladi
      const updated = await QuizSubmission.findOneAndUpdate(
        { _id: existing._id, "answers.questionId": { $nin: questions.map((q) => String(q._id)) } },
        {
          $push: { answers: { $each: graded.answers } },
          $inc: { totalScore: graded.totalScore, maxScore: graded.maxScore },
          $set: { status: hasOpenEnded || existing.status === "submitted" ? "submitted" : "graded" },
        },
        { returnDocument: "after" }
      ).lean();
      if (!updated) {
        return { success: false, error: "Siz bu testni allaqachon topshirgansiz" };
      }
      submission = updated as typeof submission;
    } else {
      submission = await QuizSubmission.create({
        quizId: quiz._id,
        lessonId: lesson._id,
        studentId: user.userId,
        answers: graded.answers,
        totalScore: graded.totalScore,
        maxScore: graded.maxScore,
        status: hasOpenEnded ? "submitted" : "graded",
        submittedAt: new Date(),
      });
    }
    const { totalScore, maxScore, status } = submission;
    const answers = submission.answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      isCorrect: a.isCorrect,
      pointsAwarded: a.pointsAwarded,
      mentorFeedback: a.mentorFeedback,
      aiGraded: a.aiGraded,
      correctAnswer: a.correctAnswer,
    }));

    // Gamifikatsiya: javob berilgan savollar kunlik topshiriqqa sanaladi, to'g'ri javoblar coin beradi (javobdan keyin)
    const answered = graded.answers
      .filter((a) => (Array.isArray(a.value) ? a.value.length > 0 : String(a.value ?? "").trim() !== ""))
      .map((a) => ({ questionId: a.questionId, isCorrect: a.isCorrect }));
    if (answered.length > 0) {
      const studentId = user.userId;
      after(() => rewardQuizAnswers(studentId, answered).then(() => undefined).catch((error) => console.error("Quiz reward error:", error)));
    }

    // Ochiq javoblar javob qaytarilgandan keyin AI bilan tekshiriladi; mentor belgilagan savollar unga qoladi
    const aiPending = hasOpenEnded && pendingAiAnswers(questions, graded.answers).length > 0;
    if (aiPending) {
      const submissionId = submission._id.toString();
      const lessonId = lesson._id.toString();
      after(async () => {
        try {
          await aiGradeQuizSubmission(submissionId);
          revalidatePath(`/lessons/${lessonId}`);
        } catch (error) {
          console.error("Quiz AI grading error:", error);
        }
      });
    }
    const needsMentor = questions.some((q) => q.type === "open_ended" && !isAutoOpenQuestion(q));

    revalidatePath(`/lessons/${lesson._id}`);
    revalidatePath(`/mentor/lessons/${lesson._id}`);

    return {
      success: true,
      message: hasOpenEnded
        ? needsMentor || !aiPending
          ? "Javoblaringiz qabul qilindi. Ochiq savollar mentor tomonidan tekshiriladi."
          : "Javoblaringiz qabul qilindi. Ochiq savollar avtomatik tekshirilmoqda — natija bir ozdan keyin chiqadi."
        : `Test yakunlandi! Natijangiz: ${totalScore} / ${maxScore} ball`,
      data: { totalScore, maxScore, status, answers },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Testni topshirishda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Get quiz for mentor editor
 */
export async function getQuizForMentor(lessonId: string): Promise<ActionState<IQuizData | null>> {
  try {
    await requireMentor();
    await connectDB();

    const quiz = await Quiz.findOne({ lessonId }).lean();
    if (!quiz) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        ...quiz,
        _id: quiz._id.toString(),
        lessonId: quiz.lessonId.toString(),
        questions: quiz.questions.map((q) => ({
          ...q,
          _id: q._id?.toString(),
        })),
        createdAt: quiz.createdAt?.toString(),
        updatedAt: quiz.updatedAt?.toString(),
      },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Xatolik yuz berdi";
    return { success: false, error: message };
  }
}

/**
 * Upsert quiz for a lesson by mentor
 */
export async function upsertQuizAction(data: unknown): Promise<ActionState> {
  try {
    const user = await requireMentor();
    const parsed = quizUpsertSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await connectDB();

    const lesson = await Lesson.findById(parsed.data.lessonId);
    if (!lesson) {
      return { success: false, error: "Dars topilmadi" };
    }

    const wasPublished = Boolean(await Quiz.exists({ lessonId: parsed.data.lessonId, isPublished: true }));
    const saved = await Quiz.findOneAndUpdate(
      { lessonId: parsed.data.lessonId },
      {
        lessonId: parsed.data.lessonId,
        title: parsed.data.title,
        description: parsed.data.description,
        questions: parsed.data.questions,
        isPublished: parsed.data.isPublished,
        passingScore: parsed.data.passingScore,
      },
      { upsert: true, returnDocument: "after", runValidators: true }
    ).lean();

    // Dars boshqa guruhlar bilan bog'langan bo'lsa, test ham o'sha nusxalarda yangilanadi.
    // Savollar o'z _id lari bilan ko'chiriladi — topshirilgan javoblar savollarga bog'lanib qolaveradi.
    let syncedCount = 0;
    if (lesson.linkId && saved) {
      const siblings = await Lesson.find({ linkId: lesson.linkId, _id: { $ne: lesson._id } }).select("_id").lean();
      for (const sib of siblings) {
        // Savollar ko'chiriladi, lekin test har guruhda alohida ochiladi (yangi nusxa — yopiq)
        await Quiz.findOneAndUpdate(
          { lessonId: sib._id },
          {
            $set: {
              title: saved.title,
              description: saved.description,
              questions: saved.questions,
              passingScore: saved.passingScore,
            },
            $setOnInsert: { lessonId: sib._id, isPublished: false },
          },
          { upsert: true, runValidators: true }
        );
        revalidatePath(`/lessons/${sib._id}`);
      }
      syncedCount = siblings.length;
    }

    // Test birinchi marta e'lon qilinganda (dars ham nashr etilgan bo'lsa) guruhga xabar beriladi
    if (saved?.isPublished && !wasPublished && lesson.isPublished) {
      notifyGroup(lesson.groupId, "exam_new", { kind: "quiz", title: `${lesson.title}: ${saved.title}`, href: `/lessons/${lesson._id}` });
    }

    await AuditLog.create({
      actorId: user.userId,
      action: "UPSERT_QUIZ",
      details: { lessonId: parsed.data.lessonId, title: parsed.data.title },
    });

    revalidatePath(`/lessons/${parsed.data.lessonId}`);
    revalidatePath(`/mentor/lessons/${parsed.data.lessonId}`);

    return {
      success: true,
      message:
        syncedCount > 0
          ? `Kichik test saqlandi (${syncedCount} ta bog'langan guruhda ham)`
          : "Kichik test muvaffaqiyatli saqlandi",
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Testni saqlashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Get submissions of a quiz for mentor
 */
export async function getQuizSubmissionsForLesson(lessonId: string): Promise<
  ActionState<
    {
      _id: string;
      studentName: string;
      studentLogin: string;
      totalScore: number;
      maxScore: number;
      status: string;
      submittedAt: string;
      answersCount: number;
    }[]
  >
> {
  try {
    await requireMentor();
    await connectDB();

    const quiz = await Quiz.findOne({ lessonId }).lean();
    if (!quiz) {
      return { success: true, data: [] };
    }

    const submissions = await QuizSubmission.find({ quizId: quiz._id })
      .populate("studentId", "fullName login")
      .sort({ submittedAt: -1 })
      .lean();

    const data = (
      submissions as unknown as Array<{
        _id: { toString: () => string };
        studentId?: { fullName?: string; login?: string };
        totalScore: number;
        maxScore: number;
        status: string;
        submittedAt?: Date;
        answers?: unknown[];
      }>
    ).map((sub) => ({
      _id: sub._id.toString(),
      studentName: sub.studentId?.fullName || "Noma'lum",
      studentLogin: sub.studentId?.login || "-",
      totalScore: sub.totalScore,
      maxScore: sub.maxScore,
      status: sub.status,
      submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : "",
      answersCount: sub.answers?.length || 0,
    }));

    return { success: true, data };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Topshiriqlarni yuklashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Grade quiz submission manually by mentor
 */
export async function gradeQuizSubmissionAction(data: unknown): Promise<ActionState> {
  try {
    const user = await requireMentor();
    const parsed = quizGradeSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await connectDB();
    const submission = await QuizSubmission.findById(parsed.data.submissionId);
    if (!submission) {
      return { success: false, error: "Topshiriq topilmadi" };
    }

    const gradesMap = new Map(
      parsed.data.grades.map((g) => [g.questionId, { points: g.pointsAwarded, feedback: g.mentorFeedback, correctAnswer: g.correctAnswer }])
    );

    const quiz = await Quiz.findById(submission.quizId).select("questions").lean();
    const maxPoints = new Map((quiz?.questions ?? []).map((q) => [String(q._id), q.points]));
    for (const [questionId, grade] of gradesMap) {
      const max = maxPoints.get(questionId);
      if (max !== undefined && grade.points > max) {
        return { success: false, error: `Ball savolning maksimal balidan (${max}) oshmasligi kerak` };
      }
    }

    let newTotalScore = 0;
    submission.answers.forEach((ans) => {
      const grade = gradesMap.get(ans.questionId);
      if (grade) {
        ans.pointsAwarded = grade.points;
        ans.isCorrect = grade.points >= (maxPoints.get(ans.questionId) ?? Infinity);
        // Mentor ko'rib chiqdi — endi bu AI bahosi emas
        ans.aiGraded = false;
        if (grade.feedback !== undefined) {
          ans.mentorFeedback = grade.feedback;
        }
        if (grade.correctAnswer !== undefined) {
          ans.correctAnswer = grade.correctAnswer.trim() || undefined;
        }
      }
      newTotalScore += ans.pointsAwarded;
    });

    submission.totalScore = newTotalScore;
    submission.status = "graded";
    await submission.save();

    await AuditLog.create({
      actorId: user.userId,
      targetUserId: submission.studentId,
      action: "GRADE_QUIZ",
      details: { submissionId: submission._id, totalScore: newTotalScore },
    });

    revalidatePath(`/lessons/${submission.lessonId}`);
    revalidatePath(`/mentor/lessons/${submission.lessonId}`);
    return { success: true, message: "Baho muvaffaqiyatli saqlandi" };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Baholashda xatolik";
    return { success: false, error: message };
  }
}

export interface QuizReviewItem {
  submissionId: string;
  studentName: string;
  status: string;
  totalScore: number;
  maxScore: number;
  /** Faqat ochiq savollarga berilgan javoblar */
  answers: {
    questionId: string;
    prompt: string;
    sample: string;
    maxPoints: number;
    /** Savolni AI tekshiradi (false — mentor) */
    auto: boolean;
    value: string;
    pointsAwarded: number;
    feedback: string;
    aiGraded: boolean;
    /** O'quvchi natijada ko'radigan to'g'ri javob (savolda namuna bo'lmasa): AI yozgan yoki mentor tahrirlagan */
    correctAnswer: string;
  }[];
}

/**
 * Dars testidagi ochiq javoblar: tekshirish kerak bo'lganlari birinchi, keyin AI baholaganlari
 * (mentor ularni ko'rib, bahoni o'zgartira oladi)
 */
export async function getQuizReviewQueue(lessonId: string): Promise<ActionState<QuizReviewItem[]>> {
  try {
    await requireMentor();
    if (typeof lessonId !== "string" || !mongoose.isValidObjectId(lessonId)) return { success: true, data: [] };
    await connectDB();
    const quiz = await Quiz.findOne({ lessonId }).lean();
    const open = (quiz?.questions ?? []).filter((q) => q.type === "open_ended");
    if (!quiz || open.length === 0) return { success: true, data: [] };

    const submissions = await QuizSubmission.find({ quizId: quiz._id, status: { $in: ["submitted", "graded"] } })
      .populate("studentId", "fullName")
      .sort({ submittedAt: 1 })
      .lean();

    const data: QuizReviewItem[] = submissions
      .map((sub) => ({
        submissionId: sub._id.toString(),
        studentName: (sub.studentId as unknown as { fullName?: string } | null)?.fullName || "O'chirilgan o'quvchi",
        status: sub.status,
        totalScore: sub.totalScore,
        maxScore: sub.maxScore,
        answers: open.map((q) => {
          const a = sub.answers.find((x) => x.questionId === String(q._id));
          return {
            questionId: String(q._id),
            prompt: q.prompt,
            sample: (q.correctAnswers ?? []).join("\n"),
            maxPoints: q.points,
            auto: isAutoOpenQuestion(q),
            value: typeof a?.value === "string" ? a.value : "",
            pointsAwarded: a?.pointsAwarded ?? 0,
            feedback: a?.mentorFeedback ?? "",
            aiGraded: Boolean(a?.aiGraded),
            correctAnswer: a?.correctAnswer ?? "",
          };
        }),
      }))
      .sort((a, b) => Number(a.status !== "submitted") - Number(b.status !== "submitted"));

    return { success: true, data };
  } catch (err: unknown) {
    unstable_rethrow(err);
    return { success: false, error: err instanceof Error ? err.message : "Javoblarni yuklashda xatolik" };
  }
}

/** Dars testining hali tekshirilmagan ochiq javoblarini AI bilan qayta tekshiradi */
export async function runQuizAiGradingAction(lessonId: string): Promise<ActionState<{ checked: number; graded: number }>> {
  try {
    await requireMentor();
    if (typeof lessonId !== "string" || !mongoose.isValidObjectId(lessonId)) return { success: false, error: "Dars topilmadi" };
    await connectDB();
    const quiz = await Quiz.findOne({ lessonId }).select("_id").lean();
    if (!quiz) return { success: false, error: "Test topilmadi" };
    const data = await aiGradePending("quiz", quiz._id);
    revalidatePath(`/mentor/lessons/${lessonId}`);
    revalidatePath(`/lessons/${lessonId}`);
    return {
      success: true,
      data,
      message:
        data.checked === 0
          ? "Tekshirilmagan javob yo'q"
          : `${data.checked} ta topshiriqdan ${data.graded} tasi to'liq baholandi${data.graded < data.checked ? " — qolganlarini o'zingiz ko'rib chiqing" : ""}`,
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    return { success: false, error: err instanceof Error ? err.message : "AI tekshiruvida xatolik" };
  }
}
