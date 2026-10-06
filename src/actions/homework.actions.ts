"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Lesson, IHomework, IMaterial } from "@/lib/db/models/lesson.model";
import {
  HomeworkSubmission,
  HomeworkStatus,
  IHomeworkFile,
} from "@/lib/db/models/homework-submission.model";
import { Group } from "@/lib/db/models/group.model";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { getCurrentUser, requireAuth, requireMentor, requireStudent } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import {
  homeworkGradeSchema,
  homeworkReturnSchema,
  homeworkSubmitSchema,
} from "@/lib/validations/homework.schema";
import { DEFAULT_HOMEWORK_COINS, type HomeworkState } from "@/lib/homework-status";
import { notify, notifyMentors } from "@/lib/notifications/notify";
import { ActionResult } from "./auth.actions";

const isObjectId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

export interface HomeworkTask {
  instructions: string;
  attachments: IMaterial[];
  dueAt: string | null;
  coinsReward: number;
}

export interface HomeworkSubmissionView {
  _id: string;
  text: string;
  links: string[];
  files: IHomeworkFile[];
  status: HomeworkStatus;
  submittedAt: string;
  isLate: boolean;
  attempt: number;
  score: number | null;
  feedback: string;
  coinsAwarded: number;
  gradedAt: string | null;
}

interface SubmissionLean {
  _id: mongoose.Types.ObjectId;
  text?: string;
  links?: string[];
  files?: IHomeworkFile[];
  status: HomeworkStatus;
  submittedAt: Date;
  isLate?: boolean;
  attempt?: number;
  score?: number | null;
  feedback?: string;
  coinsAwarded?: number;
  gradedAt?: Date | null;
}

function toSubmissionView(s: SubmissionLean): HomeworkSubmissionView {
  return {
    _id: s._id.toString(),
    text: s.text ?? "",
    links: s.links ?? [],
    files: (s.files ?? []).map((f) => ({ key: f.key, name: f.name, mimeType: f.mimeType, size: f.size })),
    status: s.status,
    submittedAt: new Date(s.submittedAt).toISOString(),
    isLate: Boolean(s.isLate),
    attempt: s.attempt ?? 1,
    score: s.score ?? null,
    feedback: s.feedback ?? "",
    coinsAwarded: s.coinsAwarded ?? 0,
    gradedAt: s.gradedAt ? new Date(s.gradedAt).toISOString() : null,
  };
}

function toTask(hw: IHomework): HomeworkTask {
  return {
    instructions: hw.instructions ?? "",
    attachments: JSON.parse(JSON.stringify(hw.attachments ?? [])) as IMaterial[],
    dueAt: hw.dueAt ? new Date(hw.dueAt).toISOString() : null,
    coinsReward: hw.coinsReward ?? DEFAULT_HOMEWORK_COINS,
  };
}

function revalidateHomework(lessonId: string) {
  // Navigatsiyadagi vazifalar soni layout'da hisoblanadi
  revalidatePath("/", "layout");
  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath(`/mentor/homework/${lessonId}`);
}

/* ------------------------------------------------------------------ */
/* O'quvchi                                                             */
/* ------------------------------------------------------------------ */

/** Dars sahifasi uchun: vazifa va o'quvchining o'z javobi */
export async function getHomeworkForStudent(
  lessonId: string
): Promise<{ task: HomeworkTask; submission: HomeworkSubmissionView | null } | null> {
  const session = await requireAuth();
  if (!isObjectId(lessonId)) return null;
  await connectToDatabase();

  const lesson = await Lesson.findById(lessonId).select("groupId isPublished homework").lean();
  if (!lesson?.homework?.isEnabled) return null;
  if (session.role === "student") {
    if (!lesson.isPublished || lesson.groupId.toString() !== session.groupId) return null;
  }

  const submission =
    session.role === "student"
      ? await HomeworkSubmission.findOne({ lessonId, studentId: session.userId }).lean<SubmissionLean>()
      : null;

  return { task: toTask(lesson.homework), submission: submission ? toSubmissionView(submission) : null };
}

export async function submitHomeworkAction(input: unknown): Promise<ActionResult> {
  const session = await requireStudent();
  const parsed = homeworkSubmitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0].message };
  }
  const { lessonId, text, links, files } = parsed.data;
  if (!isObjectId(lessonId)) return { success: false, message: "Dars topilmadi" };

  const rate = checkRateLimit(`hw_submit_${session.userId}`, 20, 10 * 60 * 1000);
  if (!rate.allowed) {
    return { success: false, message: "Juda ko'p urinish. Birozdan keyin qayta yuboring" };
  }

  await connectToDatabase();
  const lesson = await Lesson.findById(lessonId).select("groupId isPublished homework title").lean();
  if (
    !lesson ||
    !lesson.isPublished ||
    !lesson.homework?.isEnabled ||
    !session.groupId ||
    lesson.groupId.toString() !== session.groupId
  ) {
    return { success: false, message: "Uyga vazifa topilmadi" };
  }

  // Fayl kalitlari faqat shu o'quvchining shu dars uchun yuklagan fayllari bo'lishi mumkin
  const prefix = `homework/${lessonId}/${session.userId}/`;
  if (files.some((f) => !f.key.startsWith(prefix) || f.key.includes(".."))) {
    return { success: false, message: "Fayl noto'g'ri. Qaytadan yuklab ko'ring" };
  }

  const existing = await HomeworkSubmission.findOne({ lessonId, studentId: session.userId });
  if (existing?.status === "graded") {
    return { success: false, message: "Vazifa baholangan — qayta yuborib bo'lmaydi" };
  }

  const now = new Date();
  const dueAt = lesson.homework.dueAt ? new Date(lesson.homework.dueAt) : null;
  const isLate = Boolean(dueAt && now.getTime() > dueAt.getTime());

  if (existing) {
    existing.text = text;
    existing.links = links;
    existing.files = files;
    existing.status = "submitted";
    existing.submittedAt = now;
    existing.isLate = isLate;
    existing.attempt = (existing.attempt ?? 1) + 1;
    await existing.save();
  } else {
    try {
      await HomeworkSubmission.create({
        lessonId,
        groupId: lesson.groupId,
        studentId: session.userId,
        text,
        links,
        files,
        status: "submitted",
        submittedAt: now,
        isLate,
      });
    } catch (err) {
      // Ikki marta tez bosilganda unikal indeks ikkinchisini rad etadi
      if ((err as { code?: number }).code === 11000) {
        return { success: false, message: "Javob allaqachon yuborilgan. Sahifani yangilang" };
      }
      throw err;
    }
  }

  const group = await Group.findById(lesson.groupId).select("name").lean();
  notifyMentors("homework_submitted", {
    lessonId,
    lessonTitle: lesson.title,
    studentName: session.fullName,
    groupName: group?.name,
    isLate,
    resubmitted: Boolean(existing),
  });

  revalidateHomework(lessonId);
  return {
    success: true,
    message: isLate ? "Javob yuborildi (muddatdan keyin)" : "Javob yuborildi",
  };
}

export interface MyHomeworkItem {
  lessonId: string;
  lessonTitle: string;
  quarter: number;
  order: number;
  dueAt: string | null;
  coinsReward: number;
  state: HomeworkState;
  isLate: boolean;
  score: number | null;
  coinsAwarded: number;
}

/** O'quvchining barcha vazifalari (o'z guruhining nashr etilgan darslari bo'yicha) */
export async function getMyHomeworkList(): Promise<MyHomeworkItem[]> {
  const session = await requireStudent();
  if (!session.groupId) return [];
  await connectToDatabase();

  const lessons = await Lesson.find({
    groupId: session.groupId,
    isPublished: true,
    "homework.isEnabled": true,
  })
    .select("title quarter order homework date")
    .sort({ date: -1, order: -1 })
    .lean();
  if (lessons.length === 0) return [];

  const submissions = await HomeworkSubmission.find({
    studentId: session.userId,
    lessonId: { $in: lessons.map((l) => l._id) },
  }).lean<(SubmissionLean & { lessonId: mongoose.Types.ObjectId })[]>();
  const byLesson = new Map(submissions.map((s) => [s.lessonId.toString(), s]));

  return lessons.map((l) => {
    const sub = byLesson.get(l._id.toString());
    return {
      lessonId: l._id.toString(),
      lessonTitle: l.title,
      quarter: l.quarter,
      order: l.order,
      dueAt: l.homework?.dueAt ? new Date(l.homework.dueAt).toISOString() : null,
      coinsReward: l.homework?.coinsReward ?? DEFAULT_HOMEWORK_COINS,
      state: sub ? sub.status : "missing",
      isLate: Boolean(sub?.isLate),
      score: sub?.score ?? null,
      coinsAwarded: sub?.coinsAwarded ?? 0,
    };
  });
}

/** Darslar ro'yxatidagi belgi uchun: darsId -> vazifa holati */
export async function getMyHomeworkStates(lessonIds: string[]): Promise<Record<string, HomeworkState>> {
  const session = await requireStudent();
  const ids = lessonIds.filter(isObjectId);
  if (ids.length === 0) return {};
  await connectToDatabase();
  const submissions = await HomeworkSubmission.find({ studentId: session.userId, lessonId: { $in: ids } })
    .select("lessonId status")
    .lean();
  const result: Record<string, HomeworkState> = {};
  for (const s of submissions) result[s.lessonId.toString()] = s.status;
  return result;
}

/* ------------------------------------------------------------------ */
/* Mentor                                                               */
/* ------------------------------------------------------------------ */

export interface HomeworkOverviewItem {
  lessonId: string;
  lessonTitle: string;
  quarter: number;
  order: number;
  isPublished: boolean;
  groupId: string;
  groupName: string;
  dueAt: string | null;
  totalStudents: number;
  submitted: number;
  ungraded: number;
  graded: number;
}

/** Vazifasi bor darslar: nechta o'quvchi topshirgan / tekshirilmagan */
export async function getHomeworkOverviewForMentor(groupId?: string): Promise<HomeworkOverviewItem[]> {
  await requireMentor();
  await connectToDatabase();

  const filter: Record<string, unknown> = { "homework.isEnabled": true };
  if (groupId && isObjectId(groupId)) filter.groupId = groupId;

  const lessons = await Lesson.find(filter)
    .select("title quarter order isPublished groupId homework date")
    .sort({ date: -1, order: -1 })
    .limit(200)
    .lean();
  if (lessons.length === 0) return [];

  const groupIds = [...new Set(lessons.map((l) => l.groupId.toString()))];
  const [groups, studentCounts, stats] = await Promise.all([
    Group.find({ _id: { $in: groupIds } }).select("name").lean(),
    User.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { role: "student", groupId: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: "$groupId", count: { $sum: 1 } } },
    ]),
    HomeworkSubmission.aggregate<{ _id: { lessonId: mongoose.Types.ObjectId; status: HomeworkStatus }; count: number }>([
      { $match: { lessonId: { $in: lessons.map((l) => l._id) } } },
      { $group: { _id: { lessonId: "$lessonId", status: "$status" }, count: { $sum: 1 } } },
    ]),
  ]);

  const groupNames = new Map(groups.map((g) => [g._id.toString(), g.name]));
  const totals = new Map(studentCounts.map((c) => [c._id.toString(), c.count]));
  const byLesson = new Map<string, Partial<Record<HomeworkStatus, number>>>();
  for (const s of stats) {
    const key = s._id.lessonId.toString();
    byLesson.set(key, { ...byLesson.get(key), [s._id.status]: s.count });
  }

  return lessons.map((l) => {
    const st = byLesson.get(l._id.toString()) ?? {};
    const gid = l.groupId.toString();
    return {
      lessonId: l._id.toString(),
      lessonTitle: l.title,
      quarter: l.quarter,
      order: l.order,
      isPublished: l.isPublished,
      groupId: gid,
      groupName: groupNames.get(gid) ?? "—",
      dueAt: l.homework?.dueAt ? new Date(l.homework.dueAt).toISOString() : null,
      totalStudents: totals.get(gid) ?? 0,
      submitted: (st.submitted ?? 0) + (st.graded ?? 0) + (st.returned ?? 0),
      ungraded: st.submitted ?? 0,
      graded: st.graded ?? 0,
    };
  });
}

export interface HomeworkRosterRow {
  studentId: string;
  fullName: string;
  login: string;
  state: HomeworkState;
  submission: HomeworkSubmissionView | null;
}

export interface HomeworkRoster {
  lesson: { _id: string; title: string; quarter: number; order: number; isPublished: boolean };
  group: { _id: string; name: string; grade: number } | null;
  task: HomeworkTask;
  rows: HomeworkRosterRow[];
}

/** Bitta vazifa: guruhning BARCHA o'quvchilari (topshirmaganlar ham) */
export async function getHomeworkRoster(lessonId: string): Promise<HomeworkRoster | null> {
  await requireMentor();
  if (!isObjectId(lessonId)) return null;
  await connectToDatabase();

  const lesson = await Lesson.findById(lessonId).select("title quarter order isPublished groupId homework").lean();
  if (!lesson?.homework?.isEnabled) return null;

  const [group, students, submissions] = await Promise.all([
    Group.findById(lesson.groupId).select("name grade").lean(),
    User.find({ groupId: lesson.groupId, role: "student" }).select("fullName login").lean(),
    HomeworkSubmission.find({ lessonId })
      .populate("studentId", "fullName login")
      .lean<(SubmissionLean & { studentId: { _id: mongoose.Types.ObjectId; fullName: string; login: string } | null })[]>(),
  ]);

  const rows = new Map<string, HomeworkRosterRow>();
  for (const st of students) {
    rows.set(st._id.toString(), {
      studentId: st._id.toString(),
      fullName: st.fullName,
      login: st.login,
      state: "missing",
      submission: null,
    });
  }
  for (const s of submissions) {
    // Keyin boshqa guruhga ko'chirilgan o'quvchining javobi ham ko'rinadi
    if (!s.studentId) continue;
    rows.set(s.studentId._id.toString(), {
      studentId: s.studentId._id.toString(),
      fullName: s.studentId.fullName,
      login: s.studentId.login,
      state: s.status,
      submission: toSubmissionView(s),
    });
  }

  return {
    lesson: {
      _id: lesson._id.toString(),
      title: lesson.title,
      quarter: lesson.quarter,
      order: lesson.order,
      isPublished: lesson.isPublished,
    },
    group: group ? { _id: group._id.toString(), name: group.name, grade: group.grade } : null,
    task: toTask(lesson.homework),
    rows: [...rows.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)),
  };
}

export async function gradeHomeworkAction(input: unknown): Promise<ActionResult> {
  const mentor = await requireMentor();
  const parsed = homeworkGradeSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const { submissionId, score, feedback, coins } = parsed.data;
  if (!isObjectId(submissionId)) return { success: false, message: "Javob topilmadi" };

  await connectToDatabase();
  const submission = await HomeworkSubmission.findById(submissionId);
  if (!submission) return { success: false, message: "Javob topilmadi" };

  const lesson = await Lesson.findById(submission.lessonId).select("title homework").lean();
  const maxCoins = lesson?.homework?.coinsReward ?? DEFAULT_HOMEWORK_COINS;
  if (coins > maxCoins) {
    return { success: false, message: `Coin ${maxCoins} dan oshmasligi kerak` };
  }

  // Qayta baholashda faqat farq yoziladi — coin ikki marta berilmaydi.
  // Shart bilan yangilash: bir vaqtda ikki marta bosilganda farq bir marta hisoblanadi.
  const previousCoins = submission.coinsAwarded ?? 0;
  const updated = await HomeworkSubmission.findOneAndUpdate(
    { _id: submission._id, coinsAwarded: previousCoins },
    {
      $set: {
        status: "graded",
        score,
        feedback,
        coinsAwarded: coins,
        gradedAt: new Date(),
        gradedBy: mentor.userId,
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) {
    return { success: false, message: "Javob hozirgina o'zgartirildi. Sahifani yangilab, qayta urinib ko'ring" };
  }

  const delta = coins - previousCoins;
  if (delta !== 0) {
    const student = await User.findByIdAndUpdate(
      submission.studentId,
      { $inc: { totalCoins: delta, spendableBalance: delta } },
      { returnDocument: "after" }
    );
    await CoinLedger.create({
      studentId: submission.studentId,
      amount: delta,
      type: "homework",
      referenceId: submission._id,
      description:
        delta > 0
          ? `Uyga vazifa uchun: ${lesson?.title ?? "dars"} (${score} ball)`
          : `Uyga vazifa bahosi o'zgartirildi: ${lesson?.title ?? "dars"} (${score} ball)`,
      balanceAfter: student?.totalCoins ?? 0,
    });
  }

  await AuditLog.create({
    actorId: mentor.userId,
    targetUserId: submission.studentId,
    action: "GRADE_HOMEWORK",
    details: { submissionId: submission._id, lessonId: submission.lessonId, score, coins, coinsDelta: delta },
  });

  notify(submission.studentId, "homework_graded", {
    lessonId: submission.lessonId.toString(),
    lessonTitle: lesson?.title ?? "Dars",
    score,
    coins,
    feedback,
  });

  revalidateHomework(submission.lessonId.toString());
  return { success: true, message: "Baho saqlandi" };
}

export async function returnHomeworkAction(input: unknown): Promise<ActionResult> {
  const mentor = await requireMentor();
  const parsed = homeworkReturnSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  if (!isObjectId(parsed.data.submissionId)) return { success: false, message: "Javob topilmadi" };

  await connectToDatabase();
  // Baholangan javob qaytarilmaydi: berilgan coin bilan chalkashlik bo'lmasligi uchun avval qayta baholanadi
  const submission = await HomeworkSubmission.findOneAndUpdate(
    { _id: parsed.data.submissionId, status: { $ne: "graded" } },
    { $set: { status: "returned", feedback: parsed.data.feedback, gradedAt: new Date(), gradedBy: mentor.userId } },
    { returnDocument: "after" }
  );
  if (!submission) {
    return { success: false, message: "Javob topilmadi yoki allaqachon baholangan" };
  }

  await AuditLog.create({
    actorId: mentor.userId,
    targetUserId: submission.studentId,
    action: "RETURN_HOMEWORK",
    details: { submissionId: submission._id, lessonId: submission.lessonId },
  });

  const returnedLesson = await Lesson.findById(submission.lessonId).select("title").lean();
  notify(submission.studentId, "homework_graded", {
    lessonId: submission.lessonId.toString(),
    lessonTitle: returnedLesson?.title ?? "Dars",
    returned: true,
    feedback: parsed.data.feedback,
  });

  revalidateHomework(submission.lessonId.toString());
  return { success: true, message: "Qayta ishlashga qaytarildi" };
}

/** Javob fayli uchun vaqtinchalik havola: faqat mentor yoki javob egasi */
export async function getHomeworkFileUrlAction(params: {
  submissionId: string;
  key: string;
}): Promise<{ success: boolean; downloadUrl?: string; message?: string }> {
  const session = await requireAuth();
  if (!isObjectId(params.submissionId)) return { success: false, message: "Fayl topilmadi" };
  await connectToDatabase();

  const submission = await HomeworkSubmission.findById(params.submissionId).select("studentId files").lean();
  if (!submission) return { success: false, message: "Fayl topilmadi" };
  if (session.role !== "mentor" && submission.studentId.toString() !== session.userId) {
    return { success: false, message: "Ruxsat berilmagan" };
  }
  if (!submission.files?.some((f) => f.key === params.key)) {
    return { success: false, message: "Fayl topilmadi" };
  }

  try {
    return { success: true, downloadUrl: await getDownloadPresignedUrl({ key: params.key }) };
  } catch (error) {
    console.error("Homework file URL error:", error);
    return { success: false, message: "Faylga kirishda xatolik yuz berdi" };
  }
}

/** Navigatsiyadagi son. Mentor: tekshirilmagan javoblar; o'quvchi: topshirilishi kerak bo'lgan vazifalar */
export async function getHomeworkBadgeCount(): Promise<number> {
  const session = await getCurrentUser();
  if (!session) return 0;
  try {
    await connectToDatabase();
    if (session.role === "mentor") {
      return await HomeworkSubmission.countDocuments({ status: "submitted" });
    }
    if (!session.groupId) return 0;
    const lessons = await Lesson.find({
      groupId: session.groupId,
      isPublished: true,
      "homework.isEnabled": true,
    })
      .select("_id")
      .lean();
    if (lessons.length === 0) return 0;
    const done = await HomeworkSubmission.countDocuments({
      studentId: session.userId,
      lessonId: { $in: lessons.map((l) => l._id) },
      status: { $in: ["submitted", "graded"] },
    });
    return Math.max(0, lessons.length - done);
  } catch {
    return 0;
  }
}
