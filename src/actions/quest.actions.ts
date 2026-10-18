"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Quest, type IQuest, type IQuestData } from "@/lib/db/models/quest.model";
import { QuestSubmission } from "@/lib/db/models/quest-submission.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { questInputSchema } from "@/lib/validations/quest.schema";
import { ensureSystemQuests } from "@/lib/gamification/quests";
import { monthKey, periodKeyFor } from "@/lib/gamification/periods";
import { dateFromKey } from "@/lib/schedule";
import { notifyMany } from "@/lib/notifications/notify";
import { groupShortName } from "@/lib/group-name";
import { StudentBadge } from "@/lib/db/models/student-badge.model";
import { BADGES, type BadgeId } from "@/lib/gamification/badges";
import { toQuestView, type QuestView } from "@/lib/gamification/quest-view";
import type { ActionResult } from "./auth.actions";

const isObjectId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

export interface MentorQuestRow {
  quest: QuestView;
  audienceLabel: string;
  /** Joriy davrda bajarganlar (kunlik — bugun, haftalik — shu hafta, qolganlari — jami) */
  done: number;
  pending: number;
  /** Auditoriyadagi o'quvchilar soni */
  audienceSize: number;
}

export interface MentorQuestsData {
  enabled: boolean;
  rows: MentorQuestRow[];
  stats: { pending: number; active: number; activeAuto: number; coinsThisMonth: number; participants: number; students: number };
  groups: { _id: string; name: string; grade: number; students: number }[];
}

/** Mentor: barcha topshiriqlar, holat va statistika (08) */
export async function getQuestsForMentor(): Promise<MentorQuestsData> {
  await requireMentor();
  await connectToDatabase();
  const { gamification } = await getAppSettings();
  if (gamification.enabled) await ensureSystemQuests(gamification);

  const [quests, groups, studentCounts] = await Promise.all([
    Quest.find({ status: { $ne: "archived" } }).sort({ isSystem: -1, createdAt: -1 }).lean(),
    Group.find({ isActive: true }).select("name shortName grade").sort({ grade: 1, name: 1 }).lean(),
    User.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { role: "student", groupId: { $ne: null } } },
      { $group: { _id: "$groupId", n: { $sum: 1 } } },
    ]),
  ]);
  const countByGroup = new Map(studentCounts.map((c) => [String(c._id), c.n]));
  const groupList = groups.map((g) => ({ _id: String(g._id), name: groupShortName(g), grade: g.grade, students: countByGroup.get(String(g._id)) ?? 0 }));
  const totalStudents = groupList.reduce((s, g) => s + g.students, 0);

  const ids = quests.map((q) => q._id);
  const [doneRows, pendingRows] = await Promise.all([
    QuestSubmission.aggregate<{ _id: { q: mongoose.Types.ObjectId; p: string | null }; n: number }>([
      { $match: { questId: { $in: ids }, status: "approved" } },
      { $group: { _id: { q: "$questId", p: "$periodKey" }, n: { $sum: 1 } } },
    ]),
    QuestSubmission.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { questId: { $in: ids }, status: "pending" } },
      { $group: { _id: "$questId", n: { $sum: 1 } } },
    ]),
  ]);
  const pendingBy = new Map(pendingRows.map((r) => [String(r._id), r.n]));

  const rows: MentorQuestRow[] = quests.map((q) => {
    const current = periodKeyFor(q.repeat);
    const done = doneRows
      .filter((r) => String(r._id.q) === String(q._id) && (q.repeat === "daily" || q.repeat === "weekly" ? r._id.p === current : true))
      .reduce((s, r) => s + r.n, 0);
    const gids = (q.audience?.groupIds ?? []).map(String);
    const grades = q.audience?.grades ?? [];
    const inAudience = groupList.filter((g) => (gids.length === 0 && grades.length === 0) || gids.includes(g._id) || grades.includes(g.grade));
    const audienceLabel =
      gids.length === 0 && grades.length === 0
        ? "Barcha guruhlar"
        : [
            ...groupList.filter((g) => gids.includes(g._id)).map((g) => g.name),
            ...(grades.length ? [`${grades.join(", ")}-sinf`] : []),
          ].join(", ");
    return {
      quest: toQuestView(q as unknown as IQuest),
      audienceLabel,
      done,
      pending: pendingBy.get(String(q._id)) ?? 0,
      audienceSize: inAudience.reduce((s, g) => s + g.students, 0),
    };
  });

  const monthStart = dateFromKey(`${monthKey()}-01`);
  const [coinsRow] = await CoinLedger.aggregate<{ sum: number }>([
    { $match: { type: { $in: ["quest", "login"] }, createdAt: { $gte: monthStart }, amount: { $gt: 0 } } },
    { $group: { _id: null, sum: { $sum: "$amount" } } },
  ]);
  const participants = await QuestSubmission.distinct("studentId", { status: "approved", monthKey: monthKey() });
  const active = quests.filter((q) => q.status === "published" && q.isActive);

  return {
    enabled: gamification.enabled,
    rows,
    stats: {
      pending: [...pendingBy.values()].reduce((a, b) => a + b, 0),
      active: active.length,
      activeAuto: active.filter((q) => q.verify === "auto").length,
      coinsThisMonth: coinsRow?.sum ?? 0,
      participants: participants.length,
      students: totalStudents,
    },
    groups: groupList,
  };
}

export async function getQuestForMentor(id: string): Promise<QuestView | null> {
  await requireMentor();
  if (!isObjectId(id)) return null;
  await connectToDatabase();
  const q = await Quest.findById(id).lean();
  return q ? toQuestView(q as unknown as IQuest) : null;
}

function coinsLabel(q: Pick<IQuestData, "reward" | "verify">): string {
  if (q.verify === "competition") return `${q.reward.places.join(" / ")} coin (1–3-o'rinlar)`;
  return q.reward.coinsMin === q.reward.coinsMax ? `+${q.reward.coinsMin} coin` : `+${q.reward.coinsMin}–${q.reward.coinsMax} coin`;
}

/** Auditoriyadagi o'quvchilar (e'lon xabari uchun) */
async function audienceStudentIds(q: Pick<IQuestData, "audience">): Promise<mongoose.Types.ObjectId[]> {
  const gids = (q.audience?.groupIds ?? []).map(String);
  const grades = q.audience?.grades ?? [];
  let groupIds: mongoose.Types.ObjectId[] | null = null;
  if (gids.length || grades.length) {
    const groups = await Group.find({ $or: [{ _id: { $in: gids } }, { grade: { $in: grades } }] }).select("_id").lean();
    groupIds = groups.map((g) => g._id);
  }
  const users = await User.find({ role: "student", ...(groupIds ? { groupId: { $in: groupIds } } : { groupId: { $ne: null } }) })
    .select("_id")
    .lean();
  return users.map((u) => u._id);
}

/** Yaratish yoki tahrirlash (09). `publish` — e'lon qilish, aks holda qoralama */
export async function saveQuestAction(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const mentor = await requireMentor();
  const parsed = questInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const { publish, ...data } = parsed.data;

  const { gamification } = await getAppSettings();
  const maxCoins = data.verify === "competition" ? Math.max(...data.reward.places) : data.reward.coinsMax;
  if (maxCoins > gamification.mentorBonusMax) {
    return { success: false, message: `Mukofot ${gamification.mentorBonusMax} coin dan oshmasin (sozlamada o'zgartirish mumkin)` };
  }

  // Avtomatik topshiriqda dalil so'ralmaydi; musobaqada mukofot o'rinlar bo'yicha
  const doc = {
    ...data,
    autoRule: data.verify === "auto" ? data.autoRule : null,
    evidence: data.verify === "auto" ? { link: "none" as const, file: false, certId: false, note: false } : data.evidence,
    reward:
      data.verify === "competition"
        ? { ...data.reward, coinsMin: Math.min(...data.reward.places), coinsMax: Math.max(...data.reward.places) }
        : { ...data.reward, places: [] },
  };

  await connectToDatabase();
  let quest: IQuest | null;
  let wasPublished = false;
  if (id) {
    if (!isObjectId(id)) return { success: false, message: "Topshiriq topilmadi" };
    const existing = await Quest.findById(id);
    if (!existing) return { success: false, message: "Topshiriq topilmadi" };
    wasPublished = existing.status === "published";
    existing.set({
      ...doc,
      status: publish ? "published" : existing.status === "published" ? "published" : "draft",
      publishedAt: existing.publishedAt ?? (publish ? new Date() : null),
    });
    quest = await existing.save();
  } else {
    quest = await Quest.create({
      ...doc,
      status: publish ? "published" : "draft",
      isActive: true,
      publishedAt: publish ? new Date() : null,
      createdBy: mentor.userId,
    });
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: id ? "UPDATE_QUEST" : "CREATE_QUEST",
    details: { questId: quest._id, title: quest.title, status: quest.status },
  });

  // Birinchi marta e'lon qilinganda auditoriyaga Telegram xabari
  if (publish && !wasPublished && quest.notify?.announce && gamification.enabled) {
    const ids = await audienceStudentIds(quest);
    notifyMany(ids, "quest_new", { questId: String(quest._id), title: quest.title, coinsLabel: coinsLabel(quest) });
  }

  revalidatePath("/mentor/quests");
  revalidatePath("/quests");
  return { success: true, message: publish ? "Topshiriq e'lon qilindi" : "Qoralama saqlandi", data: { id: String(quest._id) } };
}

/** Faol/nofaol (e'lon qilingan topshiriqni vaqtincha to'xtatish) */
export async function setQuestActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const mentor = await requireMentor();
  if (!isObjectId(id) || typeof active !== "boolean") return { success: false, message: "Topshiriq topilmadi" };
  await connectToDatabase();
  const res = await Quest.updateOne({ _id: id }, { $set: { isActive: active } });
  if (res.matchedCount === 0) return { success: false, message: "Topshiriq topilmadi" };
  await AuditLog.create({ actorId: mentor.userId, action: "UPDATE_QUEST", details: { questId: id, isActive: active } });
  revalidatePath("/mentor/quests");
  revalidatePath("/quests");
  return { success: true, message: active ? "Topshiriq faollashtirildi" : "Topshiriq to'xtatildi" };
}

/** Arxivga olish: o'quvchilarga ko'rinmaydi, yuborishlar va berilgan coin saqlanadi */
export async function archiveQuestAction(id: string): Promise<ActionResult> {
  const mentor = await requireMentor();
  if (!isObjectId(id)) return { success: false, message: "Topshiriq topilmadi" };
  await connectToDatabase();
  const quest = await Quest.findByIdAndUpdate(id, { $set: { status: "archived", isActive: false } });
  if (!quest) return { success: false, message: "Topshiriq topilmadi" };
  await AuditLog.create({ actorId: mentor.userId, action: "ARCHIVE_QUEST", details: { questId: id, title: quest.title } });
  revalidatePath("/mentor/quests");
  revalidatePath("/quests");
  return { success: true, message: "Topshiriq arxivga olindi" };
}

export interface QuestFormContext {
  groups: { _id: string; name: string; grade: number; students: number }[];
  /** Oxirgi 30 kunda o'rtacha o'quvchi olgan coin (xaridsiz) — mukofot hajmini solishtirish uchun */
  avgMonthlyCoins: number;
  mentorBonusMax: number;
}

export async function getQuestFormContext(): Promise<QuestFormContext> {
  await requireMentor();
  await connectToDatabase();
  const { gamification } = await getAppSettings();
  const [groups, studentCounts] = await Promise.all([
    Group.find({ isActive: true }).select("name shortName grade").sort({ grade: 1, name: 1 }).lean(),
    User.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { role: "student", groupId: { $ne: null } } },
      { $group: { _id: "$groupId", n: { $sum: 1 } } },
    ]),
  ]);
  const countBy = new Map(studentCounts.map((c) => [String(c._id), c.n]));
  const list = groups.map((g) => ({ _id: String(g._id), name: groupShortName(g), grade: g.grade, students: countBy.get(String(g._id)) ?? 0 }));
  const students = list.reduce((s, g) => s + g.students, 0);

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [earned] = await CoinLedger.aggregate<{ sum: number }>([
    { $match: { createdAt: { $gte: since }, amount: { $gt: 0 }, type: { $nin: ["purchase", "adjustment"] } } },
    { $group: { _id: null, sum: { $sum: "$amount" } } },
  ]);
  return {
    groups: list,
    avgMonthlyCoins: students > 0 ? Math.round((earned?.sum ?? 0) / students) : 0,
    mentorBonusMax: gamification.mentorBonusMax,
  };
}

export interface BadgeStatsRow {
  id: BadgeId;
  title: string;
  description: string;
  tiers: { tier: "bronze" | "silver" | "gold"; threshold: number; coins: number; students: number }[];
}

/** Mentor: nishonlar katalogi va har bosqichni olgan o'quvchilar soni */
export async function getBadgeStats(): Promise<{ rows: BadgeStatsRow[]; students: number }> {
  await requireMentor();
  await connectToDatabase();
  const [counts, students] = await Promise.all([
    StudentBadge.aggregate<{ _id: { b: string; t: string }; n: number }>([{ $group: { _id: { b: "$badge", t: "$tier" }, n: { $sum: 1 } } }]),
    User.countDocuments({ role: "student", groupId: { $ne: null } }),
  ]);
  const n = (b: string, t: string) => counts.find((c) => c._id.b === b && c._id.t === t)?.n ?? 0;
  return {
    students,
    rows: BADGES.map((b) => ({ id: b.id, title: b.title, description: b.description, tiers: b.tiers.map((t) => ({ ...t, students: n(b.id, t.tier) })) })),
  };
}
