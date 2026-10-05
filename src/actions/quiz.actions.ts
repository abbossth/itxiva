"use server";

import { connectDB } from "@/lib/db/connect";
import { Quiz, IQuizQuestion, IQuizData } from "@/lib/db/models/quiz.model";
import { QuizSubmission, IQuizSubmissionData } from "@/lib/db/models/quiz-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireAuth, requireMentor, requireStudent, requireGroupAccess } from "@/lib/auth/guards";
import { quizUpsertSchema, quizSubmitSchema, quizGradeSchema } from "@/lib/validations/quiz.schema";
import { autoGradeQuiz } from "@/lib/grading";
import { revalidatePath } from "next/cache";

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
    await connectDB();

    const lesson = await Lesson.findById(lessonId).lean();
    if (!lesson) {
      return { success: false, error: "Dars topilmadi" };
    }

    if (user.role === "student") {
      await requireGroupAccess(lesson.groupId.toString());
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

    // Sanitize quiz questions for students who haven't submitted
    const questions: IQuizQuestion[] = quizDoc.questions.map((q) => {
      const isGraded = submissionDoc && submissionDoc.status === "graded";
      return {
        _id: q._id?.toString(),
        type: q.type,
        prompt: q.prompt,
        options: q.options || [],
        correctAnswers: isGraded || user.role === "mentor" ? q.correctAnswers : [],
        points: q.points,
        explanation: isGraded || user.role === "mentor" ? q.explanation : undefined,
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
    const message = err instanceof Error ? err.message : "Xatolik yuz berdi";
    return { success: false, error: message };
  }
}

/**
 * Submit quiz answers by student
 */
export async function submitQuizAction(
  data: unknown
): Promise<ActionState<{ totalScore: number; maxScore: number; status: string }>> {
  try {
    const user = await requireStudent();
    const parsed = quizSubmitSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
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

    // Auto-grade
    const { answers, totalScore, maxScore, hasOpenEnded } = autoGradeQuiz({
      questions: quiz.questions,
      submittedAnswers: parsed.data.answers,
    });

    const status = hasOpenEnded ? "submitted" : "graded";

    await QuizSubmission.findOneAndUpdate(
      {
        quizId: quiz._id,
        studentId: user.userId,
      },
      {
        quizId: quiz._id,
        lessonId: lesson._id,
        studentId: user.userId,
        answers,
        totalScore,
        maxScore,
        status,
        submittedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    revalidatePath(`/lessons/${lesson._id}`);
    revalidatePath(`/mentor/lessons/${lesson._id}`);

    return {
      success: true,
      message: hasOpenEnded
        ? "Javoblaringiz qabul qilindi. Ochiq savollar mentor tomonidan tekshiriladi."
        : `Test yakunlandi! Natijangiz: ${totalScore} / ${maxScore} ball`,
      data: { totalScore, maxScore, status },
    };
  } catch (err: unknown) {
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

    await Quiz.findOneAndUpdate(
      { lessonId: parsed.data.lessonId },
      {
        lessonId: parsed.data.lessonId,
        title: parsed.data.title,
        description: parsed.data.description,
        questions: parsed.data.questions,
        isPublished: parsed.data.isPublished,
        passingScore: parsed.data.passingScore,
      },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      actorId: user.userId,
      action: "UPSERT_QUIZ",
      details: { lessonId: parsed.data.lessonId, title: parsed.data.title },
    });

    revalidatePath(`/lessons/${parsed.data.lessonId}`);
    revalidatePath(`/mentor/lessons/${parsed.data.lessonId}`);

    return { success: true, message: "Kichik test muvaffaqiyatli saqlandi" };
  } catch (err: unknown) {
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
      .populate("studentId", "fullName username")
      .sort({ submittedAt: -1 })
      .lean();

    const data = (
      submissions as unknown as Array<{
        _id: { toString: () => string };
        studentId?: { fullName?: string; username?: string };
        totalScore: number;
        maxScore: number;
        status: string;
        submittedAt?: Date;
        answers?: unknown[];
      }>
    ).map((sub) => ({
      _id: sub._id.toString(),
      studentName: sub.studentId?.fullName || "Noma'lum",
      studentLogin: sub.studentId?.username || "-",
      totalScore: sub.totalScore,
      maxScore: sub.maxScore,
      status: sub.status,
      submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : "",
      answersCount: sub.answers?.length || 0,
    }));

    return { success: true, data };
  } catch (err: unknown) {
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
      parsed.data.grades.map((g) => [g.questionId, { points: g.pointsAwarded, feedback: g.mentorFeedback }])
    );

    let newTotalScore = 0;
    submission.answers.forEach((ans) => {
      const grade = gradesMap.get(ans.questionId);
      if (grade) {
        ans.pointsAwarded = grade.points;
        if (grade.feedback !== undefined) {
          ans.mentorFeedback = grade.feedback;
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
    return { success: true, message: "Baho muvaffaqiyatli saqlandi" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Baholashda xatolik";
    return { success: false, error: message };
  }
}
