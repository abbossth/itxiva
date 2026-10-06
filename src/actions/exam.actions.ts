"use server";

import { connectDB } from "@/lib/db/connect";
import { Exam, IExam, IExamData, IExamQuestion } from "@/lib/db/models/exam.model";
import {
  ExamSubmission,
  IExamSubmission,
  IExamAnswer,
  IExamSubmissionData,
  ExamSubmissionStatus,
} from "@/lib/db/models/exam-submission.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireStudent } from "@/lib/auth/guards";
import {
  examUpsertSchema,
  examSubmitSchema,
  examSaveDraftSchema,
  examGradeSchema,
} from "@/lib/validations/exam.schema";
import { autoGradeExam } from "@/lib/grading";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { formatDateTimeUz } from "@/lib/utils";
import { notifyMany } from "@/lib/notifications/notify";
import { User } from "@/lib/db/models/user.model";
import { after } from "next/server";
import { notifyFinishedExams } from "@/lib/notifications/scheduled";

export type ActionState<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};


// Vaqt tugaganidan keyin tarmoq kechikishi uchun beriladigan qo'shimcha muddat
const SUBMIT_GRACE_MS = 60 * 1000;

/**
 * Urinish uchun yakuniy muddat: boshlangan vaqt + davomiylik, lekin imtihon oynasi yopilishidan kech emas
 */
function getAttemptDeadline(
  startedAt: Date | string,
  exam: { durationMinutes: number; endTime: Date | string }
): number {
  return Math.min(
    new Date(startedAt).getTime() + exam.durationMinutes * 60 * 1000,
    new Date(exam.endTime).getTime()
  );
}

/**
 * passingScore foizda saqlanadi, shuning uchun ball foizga o'girib solishtiriladi
 */
function isPassingScore(score: number, maxScore: number, passingScore: number): boolean {
  if (maxScore <= 0) return false;
  return (score / maxScore) * 100 >= passingScore;
}

type SubmittedExamAnswers = Parameters<typeof autoGradeExam>[0]["submittedAnswers"];

/**
 * O'quvchi faqat o'zi shu imtihon uchun yuklagan fayl kalitini biriktira oladi
 */
function dropForeignFileKeys(
  answers: SubmittedExamAnswers,
  examId: string,
  userId: string
): SubmittedExamAnswers {
  const ownPrefix = `exams/${examId}/${userId}/`;
  return answers.map((a) =>
    a.fileKey && !a.fileKey.startsWith(ownPrefix)
      ? { ...a, fileKey: undefined, fileName: undefined, fileSize: undefined }
      : a
  );
}

/**
 * Javoblarni avtomatik baholab, urinishni yakunlaydi (saqlamaydi)
 */
function finalizeSubmission(
  submission: IExamSubmission,
  exam: IExam,
  submittedAnswers: SubmittedExamAnswers,
  submittedAt: Date
) {
  const { answers, autoScore, maxScore, requiresManualGrading } = autoGradeExam({
    questions: exam.questions,
    submittedAnswers,
  });

  submission.answers = answers;
  submission.totalScore = autoScore;
  submission.maxScore = maxScore;
  submission.status = requiresManualGrading ? "submitted" : "graded";
  submission.submittedAt = submittedAt;
  submission.isPassed = requiresManualGrading
    ? false
    : isPassingScore(autoScore, maxScore, exam.passingScore);

  return { autoScore, maxScore, requiresManualGrading };
}

/**
 * Vaqti tugagan, lekin topshirilmagan urinishlarni oxirgi saqlangan javoblar bilan yakunlaydi
 * (masalan, o'quvchi brauzerni yopib qo'ygan bo'lsa)
 */
async function finalizeExpiredAttempts(filter: Record<string, unknown>): Promise<void> {
  const stale = await ExamSubmission.find({ ...filter, status: "in_progress" });
  if (stale.length === 0) return;

  const examCache = new Map<string, IExam | null>();
  for (const submission of stale) {
    const examKey = submission.examId.toString();
    if (!examCache.has(examKey)) {
      examCache.set(examKey, await Exam.findById(submission.examId));
    }
    const exam = examCache.get(examKey);
    if (!exam) continue;

    const deadline = getAttemptDeadline(submission.startedAt, exam);
    if (Date.now() <= deadline + SUBMIT_GRACE_MS) continue;

    const savedAnswers = submission.toObject().answers as SubmittedExamAnswers;
    finalizeSubmission(submission, exam, savedAnswers, new Date(deadline));
    await submission.save();
  }
}

/**
 * O'quvchiga yuboriladigan urinish ma'lumoti: natijalar e'lon qilinmaguncha ball va to'g'ri/noto'g'ri belgilari yashiriladi
 */
function toStudentSubmission(
  sub: {
    _id: unknown;
    examId: unknown;
    studentId: unknown;
    groupId: unknown;
    attemptNumber: number;
    startedAt: Date | string;
    submittedAt?: Date | string;
    status: ExamSubmissionStatus;
    answers?: IExamAnswer[];
    totalScore: number;
    maxScore: number;
    isPassed: boolean;
    mentorGeneralFeedback?: string;
  },
  isResultsPublished: boolean
): IExamSubmissionData {
  const canSeeResults = isResultsPublished && sub.status !== "in_progress";
  const answers: IExamAnswer[] =
    sub.status === "in_progress"
      ? (sub.answers || []).map((a) => ({
          questionId: a.questionId,
          type: a.type,
          value: a.value,
          fileKey: a.fileKey,
          fileName: a.fileName,
          fileSize: a.fileSize,
          repoUrl: a.repoUrl,
          pointsAwarded: 0,
        }))
      : canSeeResults
      ? (sub.answers || []).map((a) => ({
          questionId: a.questionId,
          type: a.type,
          value: a.value,
          fileKey: a.fileKey,
          fileName: a.fileName,
          fileSize: a.fileSize,
          repoUrl: a.repoUrl,
          isCorrect: a.isCorrect,
          pointsAwarded: a.pointsAwarded,
          mentorFeedback: a.mentorFeedback,
        }))
      : [];

  return {
    _id: String(sub._id),
    examId: String(sub.examId),
    studentId: String(sub.studentId),
    groupId: String(sub.groupId),
    attemptNumber: sub.attemptNumber,
    startedAt: new Date(sub.startedAt).toISOString(),
    submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : undefined,
    status: sub.status,
    answers,
    totalScore: canSeeResults ? sub.totalScore : 0,
    maxScore: sub.maxScore,
    isPassed: canSeeResults ? sub.isPassed : false,
    mentorGeneralFeedback: canSeeResults ? sub.mentorGeneralFeedback : undefined,
  };
}

/**
 * Get all exams relevant to the logged-in student
 */
export async function getExamsForStudent(): Promise<
  ActionState<{
    active: Array<{ exam: IExamData; submission: IExamSubmissionData | null }>;
    upcoming: Array<{ exam: IExamData }>;
    past: Array<{ exam: IExamData; submission: IExamSubmissionData | null }>;
  }>
> {
  try {
    const user = await requireStudent();
    if (!user.groupId) {
      return { success: false, error: "Guruh biriktirilmagan" };
    }

    await connectDB();
    const now = new Date();

    const exams = await Exam.find({
      groupIds: user.groupId,
      isPublished: true,
    })
      .sort({ startTime: 1 })
      .lean();

    const examIds = exams.map((e) => e._id);
    await finalizeExpiredAttempts({ examId: { $in: examIds }, studentId: user.userId });

    // Eng oxirgi urinish ko'rsatiladi
    const submissions = await ExamSubmission.find({
      examId: { $in: examIds },
      studentId: user.userId,
    })
      .sort({ attemptNumber: 1 })
      .lean();

    const subMap = new Map<string, (typeof submissions)[number]>();
    for (const s of submissions) {
      subMap.set(s.examId.toString(), s);
    }

    const active: Array<{ exam: IExamData; submission: IExamSubmissionData | null }> = [];
    const upcoming: Array<{ exam: IExamData }> = [];
    const past: Array<{ exam: IExamData; submission: IExamSubmissionData | null }> = [];

    for (const exam of exams) {
      const eId = exam._id.toString();
      const sub = subMap.get(eId);
      const startTime = new Date(exam.startTime);
      const endTime = new Date(exam.endTime);

      const examData: IExamData = {
        _id: eId,
        groupIds: exam.groupIds.map((g: unknown) => String(g)),
        quarter: exam.quarter,
        title: exam.title,
        description: exam.description,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMinutes: exam.durationMinutes,
        maxAttempts: exam.maxAttempts,
        passingScore: exam.passingScore,
        isPublished: exam.isPublished,
        isResultsPublished: exam.isResultsPublished,
        questions: [], // questions list hidden in overview
        createdAt: exam.createdAt?.toString(),
        updatedAt: exam.updatedAt?.toString(),
      };

      const submissionData: IExamSubmissionData | null = sub
        ? toStudentSubmission(sub, exam.isResultsPublished)
        : null;

      if (now < startTime) {
        upcoming.push({ exam: examData });
      } else if (now > endTime) {
        past.push({ exam: examData, submission: submissionData });
      } else {
        // active window
        active.push({ exam: examData, submission: submissionData });
      }
    }

    return {
      success: true,
      data: { active, upcoming, past },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihonlarni yuklashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Get exam details for student before or during taking
 */
export async function getExamForStudent(examId: string): Promise<
  ActionState<{
    exam: IExamData;
    submission: IExamSubmissionData | null;
    isLocked: boolean;
    lockReason?: string;
    canRetake: boolean;
    serverTime: string;
  }>
> {
  try {
    const user = await requireStudent();
    await connectDB();

    const exam = await Exam.findById(examId).lean();
    if (!exam || !exam.isPublished) {
      return { success: false, error: "Imtihon topilmadi yoki e'lon qilinmagan" };
    }

    const isMember = exam.groupIds.some((g: unknown) => String(g) === user.groupId);
    if (!isMember) {
      return { success: false, error: "Ushbu imtihon sizning guruhingiz uchun emas" };
    }

    const now = new Date();
    const startTime = new Date(exam.startTime);
    const endTime = new Date(exam.endTime);

    await finalizeExpiredAttempts({ examId: exam._id, studentId: user.userId });

    const latestSubmission = await ExamSubmission.findOne({
      examId: exam._id,
      studentId: user.userId,
    })
      .sort({ attemptNumber: -1 })
      .lean();

    let isLocked = false;
    let lockReason = "";

    if (now < startTime) {
      isLocked = true;
      lockReason = `Imtihon hali boshlanmagan. Boshlanish vaqti: ${formatDateTimeUz(startTime)}`;
    } else if (now > endTime && (!latestSubmission || latestSubmission.status === "in_progress")) {
      isLocked = true;
      lockReason = "Imtihon topshirish vaqti tugagan.";
    }

    // Sanitize questions: strip correct answers
    const sanitizedQuestions: IExamQuestion[] = exam.questions.map((q) => ({
      _id: q._id?.toString(),
      type: q.type,
      prompt: q.prompt,
      options: q.options || [],
      correctAnswers: [],
      points: q.points,
      allowedFileTypes: q.allowedFileTypes,
      maxFileSizeMb: q.maxFileSizeMb,
    }));

    const examData: IExamData = {
      _id: exam._id.toString(),
      groupIds: exam.groupIds.map((g: unknown) => String(g)),
      quarter: exam.quarter,
      title: exam.title,
      description: exam.description,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      passingScore: exam.passingScore,
      isPublished: exam.isPublished,
      isResultsPublished: exam.isResultsPublished,
      questions: sanitizedQuestions,
      createdAt: exam.createdAt?.toString(),
      updatedAt: exam.updatedAt?.toString(),
    };

    const submissionData: IExamSubmissionData | null = latestSubmission
      ? toStudentSubmission(latestSubmission, exam.isResultsPublished)
      : null;

    return {
      success: true,
      data: {
        exam: examData,
        submission: submissionData,
        isLocked,
        lockReason,
        canRetake:
          !!latestSubmission &&
          latestSubmission.status !== "in_progress" &&
          latestSubmission.attemptNumber < exam.maxAttempts &&
          now <= endTime,
        serverTime: now.toISOString(),
      },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Xatolik yuz berdi";
    return { success: false, error: message };
  }
}

/**
 * Start an exam attempt for student (server records startedAt)
 */
export async function startExamAttemptAction(
  examId: string
): Promise<ActionState<{ submissionId: string; startedAt: string; durationMinutes: number }>> {
  try {
    const user = await requireStudent();
    await connectDB();

    const exam = await Exam.findById(examId);
    if (!exam || !exam.isPublished) {
      return { success: false, error: "Imtihon topilmadi yoki e'lon qilinmagan" };
    }

    const isMember = exam.groupIds.some((g: unknown) => String(g) === user.groupId);
    if (!isMember) {
      return { success: false, error: "Sizning guruhingiz uchun ruxsat berilmagan" };
    }

    const now = new Date();
    if (now < exam.startTime) {
      return { success: false, error: "Imtihon hali boshlanmagan" };
    }
    if (now > exam.endTime) {
      return { success: false, error: "Imtihon muddati tugagan" };
    }

    await finalizeExpiredAttempts({ examId: exam._id, studentId: user.userId });

    // Check existing submissions
    const existing = await ExamSubmission.find({
      examId: exam._id,
      studentId: user.userId,
    }).sort({ attemptNumber: -1 });

    if (!user.groupId) {
      return { success: false, error: "O'quvchiga guruh biriktirilmagan" };
    }

    const activeSub = existing.find((s) => s.status === "in_progress");
    if (activeSub) {
      return {
        success: true,
        data: {
          submissionId: activeSub._id.toString(),
          startedAt: new Date(activeSub.startedAt).toISOString(),
          durationMinutes: exam.durationMinutes,
        },
      };
    }

    if (existing.length >= exam.maxAttempts) {
      return {
        success: false,
        error: `Siz barcha ruxsat etilgan (${exam.maxAttempts} ta) urinishdan foydalangansiz`,
      };
    }

    const newSub = await ExamSubmission.create({
      examId: exam._id,
      studentId: user.userId,
      groupId: user.groupId,
      attemptNumber: existing.length + 1,
      startedAt: now,
      status: "in_progress",
      answers: [],
    });

    revalidatePath(`/exams/${examId}`);

    return {
      success: true,
      data: {
        submissionId: newSub._id.toString(),
        startedAt: new Date(newSub.startedAt).toISOString(),
        durationMinutes: exam.durationMinutes,
      },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihonni boshlashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Auto-save student draft answers during exam
 */
export async function saveExamDraftAction(data: unknown): Promise<ActionState> {
  try {
    const user = await requireStudent();
    const parsed = examSaveDraftSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await connectDB();
    const submission = await ExamSubmission.findOne({
      examId: parsed.data.examId,
      studentId: user.userId,
      status: "in_progress",
    });

    if (!submission) {
      return { success: false, error: "Faol imtihon topshirig'i topilmadi" };
    }

    const exam = await Exam.findById(submission.examId);
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    // Server-side time check (deadline + grace buffer)
    if (Date.now() > getAttemptDeadline(submission.startedAt, exam) + SUBMIT_GRACE_MS) {
      return { success: false, error: "Imtihon vaqti tugagan" };
    }

    submission.answers = dropForeignFileKeys(
      parsed.data.answers,
      exam._id.toString(),
      user.userId
    ) as unknown as IExamAnswer[];
    await submission.save();

    return { success: true };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Javoblarni saqlashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Submit final exam answers
 */
export async function submitExamAction(
  data: unknown
): Promise<ActionState<{ totalScore: number; maxScore: number; status: string }>> {
  try {
    const user = await requireStudent();
    const parsed = examSubmitSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await connectDB();
    const submission = await ExamSubmission.findOne({
      examId: parsed.data.examId,
      studentId: user.userId,
      status: "in_progress",
    });

    if (!submission) {
      return { success: false, error: "Topshirilayotgan faol imtihon topilmadi" };
    }

    const exam = await Exam.findById(submission.examId);
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    // Vaqt tugaganidan keyin kelgan javoblar qabul qilinmaydi: oxirgi saqlangan qoralama baholanadi
    const deadline = getAttemptDeadline(submission.startedAt, exam);
    const isLate = Date.now() > deadline + SUBMIT_GRACE_MS;
    const sourceAnswers: SubmittedExamAnswers = isLate
      ? (submission.toObject().answers as SubmittedExamAnswers)
      : dropForeignFileKeys(parsed.data.answers, exam._id.toString(), user.userId);

    // Auto-grade objective questions
    const { autoScore, maxScore, requiresManualGrading } = finalizeSubmission(
      submission,
      exam,
      sourceAnswers,
      isLate ? new Date(deadline) : new Date()
    );
    const finalStatus = submission.status;

    await submission.save();

    // Hamma topshirib bo'lgan bo'lsa, mentorga statistika darhol ketadi (aks holda — vaqt tugagach, kunlik tekshiruvda)
    after(() => notifyFinishedExams(exam._id.toString()).catch((error) => console.error("Exam notify error:", error)));

    revalidatePath(`/exams/${exam._id}`);
    revalidatePath(`/exams`);

    return {
      success: true,
      message: isLate
        ? "Imtihon vaqti tugagani uchun oxirgi saqlangan javoblaringiz qabul qilindi."
        : requiresManualGrading
        ? "Imtihon muvaffaqiyatli topshirildi! Ochiq va amaliy savollar mentor tomonidan tekshiriladi."
        : "Imtihon muvaffaqiyatli topshirildi! Natijalar mentor e'lon qilgach ko'rinadi.",
      data: {
        totalScore: exam.isResultsPublished ? autoScore : 0,
        maxScore,
        status: finalStatus,
      },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihonni topshirishda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Get student exam result (only when results are published)
 */
export async function getExamResultForStudent(examId: string): Promise<
  ActionState<{
    exam: IExamData;
    submission: IExamSubmissionData;
  }>
> {
  try {
    const user = await requireStudent();
    await connectDB();

    const exam = await Exam.findById(examId).lean();
    if (!exam || !exam.isPublished) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    if (!exam.isResultsPublished) {
      return {
        success: false,
        error: "Ushbu imtihon natijalari mentor tomonidan hali e'lon qilinmagan",
      };
    }

    const isMember = exam.groupIds.some((g: unknown) => String(g) === user.groupId);
    if (!isMember) {
      return { success: false, error: "Ushbu imtihon sizning guruhingiz uchun emas" };
    }

    await finalizeExpiredAttempts({ examId: exam._id, studentId: user.userId });

    const submission = await ExamSubmission.findOne({
      examId: exam._id,
      studentId: user.userId,
      status: { $in: ["submitted", "graded"] },
    })
      .sort({ attemptNumber: -1 })
      .lean();

    if (!submission) {
      return { success: false, error: "Sizning imtihon topshirig'ingiz topilmadi" };
    }

    const examData: IExamData = {
      _id: exam._id.toString(),
      groupIds: exam.groupIds.map((g: unknown) => String(g)),
      quarter: exam.quarter,
      title: exam.title,
      description: exam.description,
      startTime: new Date(exam.startTime).toISOString(),
      endTime: new Date(exam.endTime).toISOString(),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      passingScore: exam.passingScore,
      isPublished: exam.isPublished,
      isResultsPublished: exam.isResultsPublished,
      questions: exam.questions.map((q) => ({
        _id: q._id?.toString(),
        type: q.type,
        prompt: q.prompt,
        options: q.options || [],
        correctAnswers: q.correctAnswers || [],
        points: q.points,
        allowedFileTypes: q.allowedFileTypes,
        maxFileSizeMb: q.maxFileSizeMb,
      })),
      createdAt: exam.createdAt?.toString(),
      updatedAt: exam.updatedAt?.toString(),
    };

    const submissionData = toStudentSubmission(submission, exam.isResultsPublished);

    return {
      success: true,
      data: { exam: examData, submission: submissionData },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Natijalarni yuklashda xatolik";
    return { success: false, error: message };
  }
}

// ======================== MENTOR ACTIONS ========================

/**
 * Get all exams for mentor with group names and stats
 */
export async function getExamsForMentor(): Promise<
  ActionState<
    Array<{
      exam: IExamData;
      groupNames: string[];
      submissionsCount: number;
    }>
  >
> {
  try {
    await requireMentor();
    await connectDB();

    const exams = await Exam.find().sort({ createdAt: -1 }).populate("groupIds", "name").lean();
    const examIds = exams.map((e) => e._id);

    const submissionsCounts = await ExamSubmission.aggregate([
      { $match: { examId: { $in: examIds }, status: { $in: ["submitted", "graded"] } } },
      { $group: { _id: "$examId", count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>();
    submissionsCounts.forEach((c) => countMap.set(c._id.toString(), c.count));

    const result = exams.map((exam) => {
      const eId = exam._id.toString();
      const groups = exam.groupIds as unknown as Array<{ _id?: unknown; name?: string }>;
      const groupNames = groups.map((g) => g?.name || "Guruh");

      const examData: IExamData = {
        _id: eId,
        groupIds: groups.map((g) => (g?._id ? String(g._id) : String(g))),
        quarter: exam.quarter,
        title: exam.title,
        description: exam.description,
        startTime: new Date(exam.startTime).toISOString(),
        endTime: new Date(exam.endTime).toISOString(),
        durationMinutes: exam.durationMinutes,
        maxAttempts: exam.maxAttempts,
        passingScore: exam.passingScore,
        isPublished: exam.isPublished,
        isResultsPublished: exam.isResultsPublished,
        questions: exam.questions.map((q) => ({
          _id: q._id?.toString(),
          type: q.type,
          prompt: q.prompt,
          options: q.options || [],
          correctAnswers: q.correctAnswers || [],
          points: q.points,
        })),
        createdAt: exam.createdAt?.toString(),
        updatedAt: exam.updatedAt?.toString(),
      };

      return {
        exam: examData,
        groupNames,
        submissionsCount: countMap.get(eId) || 0,
      };
    });

    return { success: true, data: result };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihonlarni yuklashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Get exam by ID for mentor
 */
export async function getExamByIdForMentor(
  examId: string
): Promise<ActionState<IExamData>> {
  try {
    await requireMentor();
    await connectDB();

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    const examData: IExamData = {
      _id: exam._id.toString(),
      groupIds: exam.groupIds.map((g: unknown) => String(g)),
      quarter: exam.quarter,
      title: exam.title,
      description: exam.description,
      startTime: new Date(exam.startTime).toISOString(),
      endTime: new Date(exam.endTime).toISOString(),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      passingScore: exam.passingScore,
      isPublished: exam.isPublished,
      isResultsPublished: exam.isResultsPublished,
      questions: exam.questions.map((q) => ({
        _id: q._id?.toString(),
        type: q.type,
        prompt: q.prompt,
        options: q.options || [],
        correctAnswers: q.correctAnswers || [],
        points: q.points,
        allowedFileTypes: q.allowedFileTypes,
        maxFileSizeMb: q.maxFileSizeMb,
      })),
      createdAt: exam.createdAt?.toString(),
      updatedAt: exam.updatedAt?.toString(),
    };

    return { success: true, data: examData };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihonni yuklashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Create exam action
 */
export async function createExamAction(data: unknown): Promise<ActionState<string>> {
  try {
    const user = await requireMentor();
    const parsed = examUpsertSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await connectDB();
    const exam = await Exam.create({
      ...parsed.data,
      startTime: new Date(parsed.data.startTime),
      endTime: new Date(parsed.data.endTime),
    });

    await AuditLog.create({
      actorId: user.userId,
      action: "CREATE_EXAM",
      details: { title: exam.title, quarter: exam.quarter },
    });

    revalidatePath("/mentor/exams");
    return { success: true, message: "Imtihon yaratildi", data: exam._id.toString() };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihon yaratishda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Update exam action
 */
export async function updateExamAction(
  examId: string,
  data: unknown
): Promise<ActionState> {
  try {
    const user = await requireMentor();
    const parsed = examUpsertSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await connectDB();
    const exam = await Exam.findByIdAndUpdate(
      examId,
      {
        ...parsed.data,
        startTime: new Date(parsed.data.startTime),
        endTime: new Date(parsed.data.endTime),
      },
      { returnDocument: "after", runValidators: true }
    );

    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    await AuditLog.create({
      actorId: user.userId,
      action: "UPDATE_EXAM",
      details: { title: exam.title },
    });

    revalidatePath("/mentor/exams");
    revalidatePath(`/mentor/exams/${examId}`);
    return { success: true, message: "Imtihon yangilandi" };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihonni yangilashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Delete exam action
 */
export async function deleteExamAction(examId: string): Promise<ActionState> {
  try {
    const user = await requireMentor();
    await connectDB();

    const exam = await Exam.findByIdAndDelete(examId);
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    await ExamSubmission.deleteMany({ examId });

    await AuditLog.create({
      actorId: user.userId,
      action: "DELETE_EXAM",
      details: { title: exam.title },
    });

    revalidatePath("/mentor/exams");
    return { success: true, message: "Imtihon o'chirildi" };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Imtihonni o'chirishda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Toggle exam publish state
 */
export async function togglePublishExamAction(examId: string): Promise<ActionState> {
  try {
    await requireMentor();
    await connectDB();

    const exam = await Exam.findById(examId);
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    exam.isPublished = !exam.isPublished;
    await exam.save();

    if (exam.isPublished) {
      const students = await User.find({ role: "student", groupId: { $in: exam.groupIds } }).select("_id").lean();
      notifyMany(
        students.map((s) => s._id),
        "exam_new",
        { kind: "exam", title: exam.title, href: `/exams/${exam._id}`, startsAt: formatDateTimeUz(exam.startTime) }
      );
    }

    revalidatePath("/mentor/exams");
    revalidatePath("/exams");

    return {
      success: true,
      message: exam.isPublished ? "Imtihon e'lon qilindi" : "Imtihon qoralamaga olindi",
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Xatolik yuz berdi";
    return { success: false, error: message };
  }
}

/**
 * Toggle publish results state for students
 */
export async function togglePublishResultsAction(examId: string): Promise<ActionState> {
  try {
    await requireMentor();
    await connectDB();

    const exam = await Exam.findById(examId);
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    exam.isResultsPublished = !exam.isResultsPublished;
    await exam.save();

    revalidatePath("/mentor/exams");
    revalidatePath(`/mentor/exams/${examId}`);
    revalidatePath("/exams");

    return {
      success: true,
      message: exam.isResultsPublished
        ? "Natijalar o'quvchilarga ko'rinadigan bo'ldi"
        : "Natijalar yashirildi",
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Xatolik yuz berdi";
    return { success: false, error: message };
  }
}

/**
 * Get student submissions for a specific exam for mentor
 */
export async function getExamSubmissionsForMentor(examId: string): Promise<
  ActionState<
    Array<{
      _id: string;
      studentName: string;
      studentLogin: string;
      groupName: string;
      attemptNumber: number;
      startedAt: string;
      submittedAt?: string;
      status: string;
      totalScore: number;
      maxScore: number;
      isPassed: boolean;
    }>
  >
> {
  try {
    await requireMentor();
    await connectDB();

    await finalizeExpiredAttempts({ examId });

    const submissions = await ExamSubmission.find({ examId })
      .populate("studentId", "fullName login")
      .populate("groupId", "name")
      .sort({ submittedAt: -1 })
      .lean();

    interface PopulatedSubmissionItem {
      _id: unknown;
      studentId?: { fullName?: string; login?: string };
      groupId?: { name?: string };
      attemptNumber: number;
      startedAt: Date;
      submittedAt?: Date;
      status: ExamSubmissionStatus;
      totalScore: number;
      maxScore: number;
      isPassed: boolean;
    }

    const data = (submissions as unknown as PopulatedSubmissionItem[]).map((s) => ({
      _id: String(s._id),
      studentName: s.studentId?.fullName || "Noma'lum",
      studentLogin: s.studentId?.login || "-",
      groupName: s.groupId?.name || "Guruh",
      attemptNumber: s.attemptNumber,
      startedAt: new Date(s.startedAt).toISOString(),
      submittedAt: s.submittedAt ? new Date(s.submittedAt).toISOString() : undefined,
      status: s.status,
      totalScore: s.totalScore,
      maxScore: s.maxScore,
      isPassed: s.isPassed,
    }));

    return { success: true, data };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Topshiriqlarni yuklashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Get detailed submission for grading by mentor (including presigned URLs for project files)
 */
export async function getExamSubmissionDetailsForMentor(
  submissionId: string
): Promise<
  ActionState<{
    submission: IExamSubmissionData;
    studentName: string;
    studentLogin: string;
    groupName: string;
    exam: IExamData;
    fileDownloadUrls: Record<string, string>;
  }>
> {
  try {
    await requireMentor();
    await connectDB();

    await finalizeExpiredAttempts({ _id: submissionId });

    const submission = await ExamSubmission.findById(submissionId)
      .populate("studentId", "fullName login")
      .populate("groupId", "name")
      .lean();

    if (!submission) {
      return { success: false, error: "Topshiriq topilmadi" };
    }

    const exam = await Exam.findById(submission.examId).lean();
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    // Generate presigned GET URLs for uploaded files
    const fileDownloadUrls: Record<string, string> = {};
    for (const ans of submission.answers || []) {
      if (ans.fileKey) {
        try {
          const url = await getDownloadPresignedUrl({ key: ans.fileKey });
          fileDownloadUrls[ans.questionId] = url;
        } catch {
          // If R2 credentials missing locally, handle gracefully
        }
      }
    }

    const examData: IExamData = {
      _id: exam._id.toString(),
      groupIds: exam.groupIds.map((g: unknown) => String(g)),
      quarter: exam.quarter,
      title: exam.title,
      description: exam.description,
      startTime: new Date(exam.startTime).toISOString(),
      endTime: new Date(exam.endTime).toISOString(),
      durationMinutes: exam.durationMinutes,
      maxAttempts: exam.maxAttempts,
      passingScore: exam.passingScore,
      isPublished: exam.isPublished,
      isResultsPublished: exam.isResultsPublished,
      questions: exam.questions.map((q) => ({
        _id: q._id?.toString(),
        type: q.type,
        prompt: q.prompt,
        options: q.options || [],
        correctAnswers: q.correctAnswers || [],
        points: q.points,
        allowedFileTypes: q.allowedFileTypes,
        maxFileSizeMb: q.maxFileSizeMb,
      })),
      createdAt: exam.createdAt?.toString(),
      updatedAt: exam.updatedAt?.toString(),
    };

    const student = submission.studentId as unknown as { _id?: unknown; fullName?: string; login?: string } | null;
    const group = submission.groupId as unknown as { _id?: unknown; name?: string } | null;

    const submissionData: IExamSubmissionData = {
      _id: submission._id.toString(),
      examId: submission.examId.toString(),
      studentId: student?._id ? String(student._id) : submission.studentId.toString(),
      groupId: group?._id ? String(group._id) : submission.groupId.toString(),
      attemptNumber: submission.attemptNumber,
      startedAt: new Date(submission.startedAt).toISOString(),
      submittedAt: submission.submittedAt
        ? new Date(submission.submittedAt).toISOString()
        : undefined,
      status: submission.status,
      answers: submission.answers || [],
      totalScore: submission.totalScore,
      maxScore: submission.maxScore,
      isPassed: submission.isPassed,
      mentorGeneralFeedback: submission.mentorGeneralFeedback,
    };

    return {
      success: true,
      data: {
        submission: submissionData,
        studentName: student?.fullName || "Noma'lum",
        studentLogin: student?.login || "-",
        groupName: group?.name || "Guruh",
        exam: examData,
        fileDownloadUrls,
      },
    };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Topshiriqni yuklashda xatolik";
    return { success: false, error: message };
  }
}

/**
 * Grade exam submission by mentor
 */
export async function gradeExamSubmissionAction(data: unknown): Promise<ActionState> {
  try {
    const user = await requireMentor();
    const parsed = examGradeSchema.safeParse(data);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    await connectDB();
    await finalizeExpiredAttempts({ _id: parsed.data.submissionId });

    const submission = await ExamSubmission.findById(parsed.data.submissionId);
    if (!submission) {
      return { success: false, error: "Topshiriq topilmadi" };
    }
    if (submission.status === "in_progress") {
      return { success: false, error: "O'quvchi imtihonni hali topshirmagan" };
    }

    const exam = await Exam.findById(submission.examId);
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    const gradeMap = new Map(
      parsed.data.grades.map((g) => [g.questionId, { points: g.pointsAwarded, feedback: g.mentorFeedback }])
    );
    const questionPoints = new Map(
      exam.questions.map((q) => [q._id ? q._id.toString() : "", q.points])
    );

    let totalScore = 0;
    for (const ans of submission.answers) {
      const maxPoints = questionPoints.get(ans.questionId);
      const g = gradeMap.get(ans.questionId);
      if (g && maxPoints !== undefined) {
        if (g.points > maxPoints) {
          return {
            success: false,
            error: `Ball savolning maksimal balidan (${maxPoints}) oshmasligi kerak`,
          };
        }
        ans.pointsAwarded = g.points;
        if (g.feedback !== undefined) {
          ans.mentorFeedback = g.feedback;
        }
      }
      // Imtihondan o'chirilgan savollar umumiy ballga qo'shilmaydi
      if (maxPoints !== undefined) {
        totalScore += ans.pointsAwarded;
      }
    }

    const maxScore = exam.questions.reduce((sum, q) => sum + q.points, 0);

    submission.totalScore = totalScore;
    submission.maxScore = maxScore;
    submission.mentorGeneralFeedback = parsed.data.mentorGeneralFeedback;
    submission.status = "graded";
    submission.isPassed = isPassingScore(totalScore, maxScore, exam.passingScore);

    await submission.save();

    await AuditLog.create({
      actorId: user.userId,
      targetUserId: submission.studentId,
      action: "GRADE_EXAM",
      details: { submissionId: submission._id, totalScore, isPassed: submission.isPassed },
    });

    revalidatePath(`/mentor/exams/${submission.examId}`);
    revalidatePath("/exams");
    return { success: true, message: "Imtihon muvaffaqiyatli baholandi" };
  } catch (err: unknown) {
    unstable_rethrow(err);
    const message = err instanceof Error ? err.message : "Baholashda xatolik";
    return { success: false, error: message };
  }
}
