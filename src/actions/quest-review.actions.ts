"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Quest, type IQuest } from "@/lib/db/models/quest.model";
import { QuestSubmission, type IQuestCheck, type IQuestEvidence, type QuestSubmissionStatus } from "@/lib/db/models/quest-submission.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { getCurrentUser, requireAuth, requireMentor, requireStudent } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import { notify, notifyMentors } from "@/lib/notifications/notify";
import { questEvidenceSchema } from "@/lib/validations/quest-submission.schema";
import { toQuestView, type QuestView } from "@/lib/gamification/quest-view";
import { loadStudentScope, questOpen, questVisibleTo } from "@/lib/gamification/quests";
import { monthKey, periodKeyFor } from "@/lib/gamification/periods";
import { QUEST_FILE_MAX_BYTES, QUEST_FILE_TYPES, normalizeCertId, normalizeProofUrl } from "@/lib/gamification/proof";
import { ReviewError, approveSubmission, rejectSubmission, revokeSubmission, systemChecks } from "@/lib/gamification/review";
import { groupShortName } from "@/lib/group-name";
import type { ActionResult } from "./auth.actions";

const isObjectId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

export interface SubmissionView {
  _id: string;
  status: QuestSubmissionStatus;
  auto: boolean;
  submittedAt: string;
  reviewedAt: string | null;
  revoked: boolean;
  coins: number;
  xp: number;
  place: number | null;
  rejectReason: string;
  evidence: Omit<IQuestEvidence, "normUrl" | "normCertId" | "issuedAt"> & { issuedAt: string | null };
}

function toSubmissionView(s: {
  _id: unknown;
  status: QuestSubmissionStatus;
  auto?: boolean;
  submittedAt: Date | string;
  reviewedAt?: Date | string | null;
  revokedAt?: Date | string | null;
  coins?: number;
  xp?: number;
  place?: number | null;
  rejectReason?: string;
  evidence?: IQuestEvidence;
}): SubmissionView {
  const e = s.evidence ?? {};
  return {
    _id: String(s._id),
    status: s.status,
    auto: Boolean(s.auto),
    submittedAt: new Date(s.submittedAt).toISOString(),
    reviewedAt: s.reviewedAt ? new Date(s.reviewedAt).toISOString() : null,
    revoked: Boolean(s.revokedAt),
    coins: s.coins ?? 0,
    xp: s.xp ?? 0,
    place: s.place ?? null,
    rejectReason: s.rejectReason ?? "",
    evidence: {
      platform: e.platform,
      courseName: e.courseName,
      url: e.url,
      fileKey: e.fileKey,
      fileName: e.fileName,
      fileSize: e.fileSize,
      mimeType: e.mimeType,
      certId: e.certId,
      note: e.note,
      issuedAt: e.issuedAt ? new Date(e.issuedAt).toISOString() : null,
    },
  };
}

// ---------- O'quvchi ----------

export interface StudentQuestDetail {
  quest: QuestView;
  studentName: string;
  submissions: SubmissionView[];
  /** Hozir yuborish mumkinmi; mumkin bo'lmasa — sababi */
  canSubmit: boolean;
  blockedReason: string | null;
}

async function submitBlock(quest: IQuest, studentId: mongoose.Types.ObjectId): Promise<string | null> {
  if (quest.verify === "auto") return "Bu topshiriq avtomatik tekshiriladi";
  const period = periodKeyFor(quest.repeat);
  const active = await QuestSubmission.find({
    questId: quest._id,
    studentId,
    status: { $in: ["pending", "approved"] },
    ...(period ? { periodKey: period } : {}),
  })
    .select("status")
    .lean();
  if (period && active.some((s) => s.status === "approved")) {
    return quest.repeat === "once" ? "Siz bu topshiriqni bajargansiz" : "Bu davrda topshiriq bajarilgan";
  }
  if (period && active.some((s) => s.status === "pending")) return "Yuborgan ishingiz tekshiruvda";
  if (quest.guard?.monthlyLimit) {
    const used = await QuestSubmission.countDocuments({ questId: quest._id, studentId, monthKey: monthKey(), status: { $in: ["pending", "approved"] } });
    if (used >= quest.guard.monthlyLimit) return `Bu topshiriqni oyiga ko'pi bilan ${quest.guard.monthlyLimit} marta yuborish mumkin`;
  }
  return null;
}

/** O'quvchi uchun topshiriq sahifasi (02/06): shartlar, forma va yuborishlar tarixi */
export async function getStudentQuestDetail(questId: string): Promise<StudentQuestDetail | null> {
  const session = await requireStudent();
  if (!isObjectId(questId) || !(await getAppSettings()).gamification.enabled) return null;
  await connectToDatabase();
  const [quest, scope, user] = await Promise.all([
    Quest.findById(questId),
    loadStudentScope(session.userId),
    User.findById(session.userId).select("fullName").lean(),
  ]);
  if (!quest || !scope || !questVisibleTo(quest, scope) || quest.status !== "published") return null;

  const subs = await QuestSubmission.find({ questId: quest._id, studentId: scope._id }).sort({ submittedAt: -1 }).limit(30).lean();
  const blocked = questOpen(quest) ? await submitBlock(quest, scope._id) : "Topshiriq muddati tugagan yoki to'xtatilgan";
  return {
    quest: toQuestView(quest),
    studentName: user?.fullName ?? "",
    submissions: subs.map(toSubmissionView),
    canSubmit: blocked === null,
    blockedReason: blocked,
  };
}

/** Dalil yoki ish yuborish */
export async function submitQuestEvidenceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireStudent();
  const parsed = questEvidenceSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  const rate = checkRateLimit(`quest_submit_${session.userId}`, 3, 60 * 1000);
  if (!rate.allowed) return { success: false, message: `Juda tez. ${rate.resetInSeconds} soniyadan keyin qayta urinib ko'ring` };

  const { gamification } = await getAppSettings();
  if (!gamification.enabled) return { success: false, message: "Topshiriq topilmadi" };
  await connectToDatabase();
  const [quest, scope] = await Promise.all([Quest.findById(d.questId), loadStudentScope(session.userId)]);
  if (!quest || !scope || !questOpen(quest) || !questVisibleTo(quest, scope)) return { success: false, message: "Topshiriq topilmadi yoki yopilgan" };

  const block = await submitBlock(quest, scope._id);
  if (block) return { success: false, message: block };

  // Dalil talablari topshiriq sozlamasiga qarab
  const ev = quest.evidence;
  const normUrl = d.url ? normalizeProofUrl(d.url) : null;
  if (d.url && !normUrl) return { success: false, message: "Havola https:// bilan boshlanadigan to'liq manzil bo'lsin" };
  if (ev.link === "required" && !normUrl) return { success: false, message: "Tasdiqlash havolasini kiriting" };
  const normCertId = d.certId ? normalizeCertId(d.certId) : null;
  if (ev.certId && quest.verify === "proof" && !normCertId) return { success: false, message: "Sertifikat ID raqamini kiriting" };
  if (ev.note && d.note.length < 10) return { success: false, message: "Izohni yozing (kamida 10 ta belgi)" };
  if (quest.verify === "proof" && !d.confirmed) return { success: false, message: "Dalil sizga tegishli ekanini tasdiqlang" };
  if (!normUrl && !d.file && !normCertId && !d.note) return { success: false, message: "Dalil yoki ishingizni qo'shing" };

  if (d.file) {
    const prefix = `quests/${quest._id}/${session.userId}/`;
    if (!ev.file || !d.file.key.startsWith(prefix) || d.file.key.includes("..")) return { success: false, message: "Fayl noto'g'ri. Qaytadan yuklang" };
    if (!QUEST_FILE_TYPES.includes(d.file.mimeType) || d.file.size > QUEST_FILE_MAX_BYTES) {
      return { success: false, message: "Faqat PDF, JPG yoki PNG, 10 MB gacha" };
    }
  }

  let issuedAt: Date | null = null;
  if (d.issuedAt) {
    issuedAt = new Date(d.issuedAt);
    if (Number.isNaN(issuedAt.getTime()) || issuedAt.getTime() > Date.now() + 86_400_000) return { success: false, message: "Berilgan sana noto'g'ri" };
  }

  const evidence: IQuestEvidence = {
    platform: d.platform || undefined,
    courseName: d.courseName || undefined,
    url: normUrl ? d.url : undefined,
    normUrl: normUrl ?? undefined,
    certId: normCertId ? d.certId : undefined,
    normCertId: normCertId ?? undefined,
    issuedAt,
    note: d.note || undefined,
    ...(d.file ? { fileKey: d.file.key, fileName: d.file.name, fileSize: d.file.size, mimeType: d.file.mimeType } : {}),
  };

  const checks: IQuestCheck[] = await systemChecks(quest, scope, evidence);
  if (quest.guard?.uniqueProof) {
    const dup = checks.find((c) => c.key === "duplicate" && !c.ok);
    if (dup) return { success: false, message: `${dup.message}. Har bir dalil faqat bir marta qabul qilinadi` };
  }
  const late = checks.find((c) => c.key === "date" && !c.ok);
  if (late) return { success: false, message: late.message };

  const sub = await QuestSubmission.create({
    questId: quest._id,
    studentId: scope._id,
    groupId: scope.groupId,
    status: "pending",
    auto: false,
    periodKey: periodKeyFor(quest.repeat),
    monthKey: monthKey(),
    evidence,
    checks,
    submittedAt: new Date(),
  });

  if (quest.notify?.onSubmission) {
    const [student, group, pending] = await Promise.all([
      User.findById(scope._id).select("fullName").lean(),
      scope.groupId ? Group.findById(scope.groupId).select("name shortName").lean() : null,
      QuestSubmission.countDocuments({ status: "pending" }),
    ]);
    notifyMentors("quest_submitted", {
      questTitle: quest.title,
      studentName: student?.fullName ?? "O'quvchi",
      groupName: group ? groupShortName(group) : undefined,
      pending,
    });
  }

  revalidatePath("/quests");
  revalidatePath(`/quests/${quest._id}`);
  revalidatePath("/mentor/quests/review");
  return { success: true, message: "Yuborildi! Mentor tekshirgach natija Telegram'ga keladi", data: { id: String(sub._id) } };
}

/** Topshiriq fayli: faqat egasi va mentor */
export async function getQuestFileUrlAction(submissionId: string): Promise<{ success: boolean; url?: string; message?: string }> {
  const session = await requireAuth();
  if (!isObjectId(submissionId)) return { success: false, message: "Fayl topilmadi" };
  await connectToDatabase();
  const sub = await QuestSubmission.findById(submissionId).select("studentId evidence.fileKey").lean();
  if (!sub?.evidence?.fileKey) return { success: false, message: "Fayl topilmadi" };
  if (session.role !== "mentor" && String(sub.studentId) !== session.userId) return { success: false, message: "Ruxsat berilmagan" };
  try {
    return { success: true, url: await getDownloadPresignedUrl({ key: sub.evidence.fileKey, expiresInSeconds: 600 }) };
  } catch (error) {
    console.error("Quest file URL error:", error);
    return { success: false, message: "Faylni ochib bo'lmadi" };
  }
}

// ---------- Mentor: tekshiruv navbati (10) ----------

export type ReviewCategory = "certificate" | "project" | "other";

export interface ReviewItem {
  submission: SubmissionView;
  quest: QuestView;
  category: ReviewCategory;
  student: { _id: string; fullName: string; login: string; groupName: string; joinedAt: string | null };
  checks: IQuestCheck[];
  /** Shu o'quvchining shu topshiriqdagi oldingi natijalari */
  history: { approved: number; rejected: number };
}

function categoryOf(q: Pick<IQuest, "template" | "verify" | "evidence">): ReviewCategory {
  if (q.template === "certificate" || (q.verify === "proof" && q.evidence?.certId)) return "certificate";
  if (q.template === "project" || q.template === "weekly_problem" || q.verify === "competition") return "project";
  return "other";
}

export async function getReviewQueue(view: "pending" | "approved" = "pending"): Promise<ReviewItem[]> {
  await requireMentor();
  await connectToDatabase();
  const subs =
    view === "pending"
      ? await QuestSubmission.find({ status: "pending" }).sort({ submittedAt: 1 }).limit(200).lean()
      : await QuestSubmission.find({ status: "approved", auto: false }).sort({ reviewedAt: -1 }).limit(50).lean();
  if (subs.length === 0) return [];

  const [quests, users] = await Promise.all([
    Quest.find({ _id: { $in: [...new Set(subs.map((s) => String(s.questId)))] } }),
    User.find({ _id: { $in: subs.map((s) => s.studentId) } }).select("fullName login groupId createdAt").lean(),
  ]);
  const groupIds = users.map((u) => u.groupId).filter((g): g is mongoose.Types.ObjectId => Boolean(g)) as mongoose.Types.ObjectId[];
  const groups = await Group.find({ _id: { $in: groupIds } }).select("name shortName").lean();
  const questBy = new Map(quests.map((q) => [String(q._id), q]));
  const userBy = new Map(users.map((u) => [String(u._id), u]));
  const groupBy = new Map(groups.map((g) => [String(g._id), groupShortName(g)]));
  const historyRows = await QuestSubmission.aggregate<{ _id: { s: mongoose.Types.ObjectId; q: mongoose.Types.ObjectId; st: string }; n: number }>([
    { $match: { studentId: { $in: users.map((u) => u._id) }, questId: { $in: quests.map((q) => q._id) }, status: { $in: ["approved", "rejected"] } } },
    { $group: { _id: { s: "$studentId", q: "$questId", st: "$status" }, n: { $sum: 1 } } },
  ]);

  const items: ReviewItem[] = [];
  for (const s of subs) {
    const quest = questBy.get(String(s.questId));
    const user = userBy.get(String(s.studentId));
    if (!quest || !user) continue;
    // Kutilayotganlar uchun tekshiruvlar qayta hisoblanadi: yuborilgandan beri boshqa ish tasdiqlangan bo'lishi mumkin
    const checks =
      s.status === "pending"
        ? await systemChecks(quest, { _id: user._id, createdAt: user.createdAt ? new Date(user.createdAt) : undefined }, s.evidence ?? {}, s._id)
        : s.checks ?? [];
    const h = (st: string) =>
      historyRows.find((r) => String(r._id.s) === String(user._id) && String(r._id.q) === String(quest._id) && r._id.st === st)?.n ?? 0;
    items.push({
      submission: toSubmissionView(s),
      quest: toQuestView(quest),
      category: categoryOf(quest),
      student: {
        _id: String(user._id),
        fullName: user.fullName,
        login: user.login,
        groupName: user.groupId ? groupBy.get(String(user.groupId)) ?? "" : "",
        joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
      },
      checks,
      history: { approved: h("approved"), rejected: h("rejected") },
    });
  }
  return items;
}

function reviewFail(error: unknown): ActionResult {
  if (error instanceof ReviewError) return { success: false, message: error.message };
  console.error("Quest review error:", error);
  return { success: false, message: "Xatolik yuz berdi. Qaytadan urinib ko'ring" };
}

export async function approveQuestSubmissionAction(input: {
  submissionId: string;
  coins: number;
  checklist?: { name?: boolean; course?: boolean; date?: boolean; program?: boolean };
}): Promise<ActionResult> {
  const mentor = await requireMentor();
  if (!isObjectId(input?.submissionId) || !Number.isFinite(input?.coins)) return { success: false, message: "Ma'lumot noto'g'ri" };
  await connectToDatabase();
  try {
    const res = await approveSubmission({
      submissionId: input.submissionId,
      coins: input.coins,
      checklist: input.checklist,
      reviewerId: mentor.userId,
    });
    await AuditLog.create({
      actorId: mentor.userId,
      targetUserId: res.studentId,
      action: "APPROVE_QUEST",
      details: { submissionId: input.submissionId, questId: res.quest._id, questTitle: res.quest.title, coins: res.coins, xp: res.xp, place: res.place },
    });
    notify(res.studentId, "quest_result", { questId: String(res.quest._id), title: res.quest.title, approved: true, coins: res.coins, xp: res.xp });
    revalidatePath("/mentor/quests/review");
    revalidatePath("/mentor/quests");
    return { success: true, message: res.place ? `Tasdiqlandi — ${res.place}-o'rin, +${res.coins} coin` : `Tasdiqlandi: +${res.coins} coin` };
  } catch (error) {
    return reviewFail(error);
  }
}

export async function rejectQuestSubmissionAction(input: { submissionId: string; reason: string }): Promise<ActionResult> {
  const mentor = await requireMentor();
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!isObjectId(input?.submissionId)) return { success: false, message: "Ma'lumot noto'g'ri" };
  if (reason.length < 3 || reason.length > 1000) return { success: false, message: "Rad etish sababini yozing" };
  await connectToDatabase();
  try {
    const sub = await rejectSubmission(input.submissionId, reason, mentor.userId);
    const quest = await Quest.findById(sub.questId).select("title").lean();
    await AuditLog.create({
      actorId: mentor.userId,
      targetUserId: sub.studentId,
      action: "REJECT_QUEST",
      details: { submissionId: sub._id, questId: sub.questId, questTitle: quest?.title, reason },
    });
    notify(sub.studentId, "quest_result", { questId: String(sub.questId), title: quest?.title ?? "Topshiriq", approved: false, reason });
    revalidatePath("/mentor/quests/review");
    return { success: true, message: "Rad etildi — o'quvchi qayta yubora oladi" };
  } catch (error) {
    return reviewFail(error);
  }
}

export async function revokeQuestSubmissionAction(input: { submissionId: string; reason: string }): Promise<ActionResult> {
  const mentor = await requireMentor();
  const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
  if (!isObjectId(input?.submissionId)) return { success: false, message: "Ma'lumot noto'g'ri" };
  if (reason.length < 3 || reason.length > 1000) return { success: false, message: "Bekor qilish sababini yozing" };
  await connectToDatabase();
  try {
    const sub = await revokeSubmission(input.submissionId, reason, mentor.userId);
    const quest = await Quest.findById(sub.questId).select("title").lean();
    await AuditLog.create({
      actorId: mentor.userId,
      targetUserId: sub.studentId,
      action: "REVOKE_QUEST",
      details: { submissionId: sub._id, questId: sub.questId, questTitle: quest?.title, coins: sub.coins, xp: sub.xp, reason },
    });
    notify(sub.studentId, "quest_result", { questId: String(sub.questId), title: quest?.title ?? "Topshiriq", approved: false, reason: `Mukofot bekor qilindi: ${reason}` });
    revalidatePath("/mentor/quests/review");
    return { success: true, message: "Mukofot bekor qilindi — coin va XP qaytarildi" };
  } catch (error) {
    return reviewFail(error);
  }
}

/** Menyu: tekshirilishi kerak bo'lgan dalillar soni (mentor) */
export async function getQuestsBadgeCount(): Promise<number> {
  const session = await getCurrentUser();
  if (session?.role !== "mentor") return 0;
  try {
    if (!(await getAppSettings()).gamification.enabled) return 0;
    await connectToDatabase();
    return await QuestSubmission.countDocuments({ status: "pending" });
  } catch {
    return 0;
  }
}
