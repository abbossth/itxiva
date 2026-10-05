"use server";

import { connectDB } from "@/lib/db/connect";
import { Exam, IExamData, IExamQuestion } from "@/lib/db/models/exam.model";
import {
  ExamSubmission,
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

export type ActionState<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

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
    const submissions = await ExamSubmission.find({
      examId: { $in: examIds },
      studentId: user.userId,
    }).lean();

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
        ? {
            _id: sub._id.toString(),
            examId: sub.examId.toString(),
            studentId: sub.studentId.toString(),
            groupId: sub.groupId.toString(),
            attemptNumber: sub.attemptNumber,
            startedAt: new Date(sub.startedAt).toISOString(),
            submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : undefined,
            status: sub.status,
            answers: sub.answers || [],
            totalScore: sub.totalScore,
            maxScore: sub.maxScore,
            isPassed: sub.isPassed,
            mentorGeneralFeedback: exam.isResultsPublished ? sub.mentorGeneralFeedback : undefined,
          }
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
      lockReason = `Imtihon hali boshlanmagan. Boshlanish vaqti: ${startTime.toLocaleString("uz-UZ")}`;
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
      ? {
          _id: latestSubmission._id.toString(),
          examId: latestSubmission.examId.toString(),
          studentId: latestSubmission.studentId.toString(),
          groupId: latestSubmission.groupId.toString(),
          attemptNumber: latestSubmission.attemptNumber,
          startedAt: new Date(latestSubmission.startedAt).toISOString(),
          submittedAt: latestSubmission.submittedAt
            ? new Date(latestSubmission.submittedAt).toISOString()
            : undefined,
          status: latestSubmission.status,
          answers: latestSubmission.answers || [],
          totalScore: latestSubmission.totalScore,
          maxScore: latestSubmission.maxScore,
          isPassed: latestSubmission.isPassed,
          mentorGeneralFeedback: exam.isResultsPublished
            ? latestSubmission.mentorGeneralFeedback
            : undefined,
        }
      : null;

    return {
      success: true,
      data: {
        exam: examData,
        submission: submissionData,
        isLocked,
        lockReason,
        serverTime: now.toISOString(),
      },
    };
  } catch (err: unknown) {
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

    // Server-side time check (duration limit + 1 min buffer)
    const now = Date.now();
    const started = new Date(submission.startedAt).getTime();
    const maxAllowedTime = started + exam.durationMinutes * 60 * 1000 + 60000;

    if (now > maxAllowedTime || now > new Date(exam.endTime).getTime() + 60000) {
      return { success: false, error: "Imtihon vaqti tugagan" };
    }

    submission.answers = parsed.data.answers as unknown as IExamAnswer[];
    await submission.save();

    return { success: true };
  } catch (err: unknown) {
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

    // Auto-grade objective questions
    const { answers, autoScore, maxScore, requiresManualGrading } = autoGradeExam({
      questions: exam.questions,
      submittedAnswers: parsed.data.answers,
    });

    const isGraded = !requiresManualGrading;
    const finalStatus = isGraded ? "graded" : "submitted";
    const isPassed = isGraded ? autoScore >= exam.passingScore : false;

    submission.answers = answers as unknown as IExamAnswer[];
    submission.totalScore = autoScore;
    submission.maxScore = maxScore;
    submission.status = finalStatus;
    submission.submittedAt = new Date();
    submission.isPassed = isPassed;

    await submission.save();

    revalidatePath(`/exams/${exam._id}`);
    revalidatePath(`/exams`);

    return {
      success: true,
      message: requiresManualGrading
        ? "Imtihon muvaffaqiyatli topshirildi! Ochiq va amaliy savollar mentor tomonidan tekshiriladi."
        : `Imtihon topshirildi! Avtomatik testlar natijasi: ${autoScore} / ${maxScore} ball`,
      data: { totalScore: autoScore, maxScore, status: finalStatus },
    };
  } catch (err: unknown) {
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

    const submissionData: IExamSubmissionData = {
      _id: submission._id.toString(),
      examId: submission.examId.toString(),
      studentId: submission.studentId.toString(),
      groupId: submission.groupId.toString(),
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
      data: { exam: examData, submission: submissionData },
    };
  } catch (err: unknown) {
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
      { new: true }
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

    revalidatePath("/mentor/exams");
    revalidatePath("/exams");

    return {
      success: true,
      message: exam.isPublished ? "Imtihon e'lon qilindi" : "Imtihon qoralamaga olindi",
    };
  } catch (err: unknown) {
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

    const submissions = await ExamSubmission.find({ examId })
      .populate("studentId", "fullName username")
      .populate("groupId", "name")
      .sort({ submittedAt: -1 })
      .lean();

    interface PopulatedSubmissionItem {
      _id: unknown;
      studentId?: { fullName?: string; username?: string };
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
      studentLogin: s.studentId?.username || "-",
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

    const submission = await ExamSubmission.findById(submissionId)
      .populate("studentId", "fullName username")
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

    const student = submission.studentId as unknown as { _id?: unknown; fullName?: string; username?: string } | null;
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
        studentLogin: student?.username || "-",
        groupName: group?.name || "Guruh",
        exam: examData,
        fileDownloadUrls,
      },
    };
  } catch (err: unknown) {
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
    const submission = await ExamSubmission.findById(parsed.data.submissionId);
    if (!submission) {
      return { success: false, error: "Topshiriq topilmadi" };
    }

    const exam = await Exam.findById(submission.examId);
    if (!exam) {
      return { success: false, error: "Imtihon topilmadi" };
    }

    const gradeMap = new Map(
      parsed.data.grades.map((g) => [g.questionId, { points: g.pointsAwarded, feedback: g.mentorFeedback }])
    );

    let totalScore = 0;
    submission.answers.forEach((ans) => {
      const g = gradeMap.get(ans.questionId);
      if (g) {
        ans.pointsAwarded = g.points;
        if (g.feedback !== undefined) {
          ans.mentorFeedback = g.feedback;
        }
      }
      totalScore += ans.pointsAwarded;
    });

    submission.totalScore = totalScore;
    submission.mentorGeneralFeedback = parsed.data.mentorGeneralFeedback;
    submission.status = "graded";
    submission.isPassed = totalScore >= exam.passingScore;

    await submission.save();

    await AuditLog.create({
      actorId: user.userId,
      targetUserId: submission.studentId,
      action: "GRADE_EXAM",
      details: { submissionId: submission._id, totalScore, isPassed: submission.isPassed },
    });

    revalidatePath(`/mentor/exams/${submission.examId}`);
    return { success: true, message: "Imtihon muvaffaqiyatli baholandi" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Baholashda xatolik";
    return { success: false, error: message };
  }
}
