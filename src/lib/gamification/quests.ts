import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Quest, type IQuest, type QuestAutoKind } from "@/lib/db/models/quest.model";
import { QuestSubmission } from "@/lib/db/models/quest-submission.model";
import { ActivityEvent, type ActivityKind } from "@/lib/db/models/activity-event.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { getAppSettings } from "@/lib/settings";
import { awardCoins } from "./award";
import { dayKey, monthKey, periodKeyFor, weekStartKey } from "./periods";
import { stepStreak } from "./streak";
import { evaluateBadges } from "./achievements";
import type { GamificationSettings } from "./config";

type Id = string | mongoose.Types.ObjectId;

export interface StudentScope {
  _id: mongoose.Types.ObjectId;
  groupId: mongoose.Types.ObjectId | null;
  grade: number | null;
  createdAt?: Date;
}

export async function loadStudentScope(studentId: Id): Promise<StudentScope | null> {
  const user = await User.findById(studentId).select("role groupId createdAt").lean();
  if (!user || user.role !== "student") return null;
  const group = user.groupId ? await Group.findById(user.groupId).select("grade").lean() : null;
  return {
    _id: user._id,
    groupId: (user.groupId as mongoose.Types.ObjectId | null) ?? null,
    grade: group?.grade ?? null,
    createdAt: user.createdAt ? new Date(user.createdAt) : undefined,
  };
}

/** Auditoriya bo'sh bo'lsa — hamma; aks holda guruh yoki sinf mos kelishi kerak */
export function questVisibleTo(
  quest: Pick<IQuest, "audience">,
  scope: Pick<StudentScope, "groupId" | "grade">
): boolean {
  const groups = (quest.audience?.groupIds ?? []).map(String);
  const grades = quest.audience?.grades ?? [];
  if (groups.length === 0 && grades.length === 0) return true;
  return (scope.groupId !== null && groups.includes(String(scope.groupId))) || (scope.grade !== null && grades.includes(scope.grade));
}

/** E'lon qilingan, faol va muddat ichida */
export function questOpen(
  quest: Pick<IQuest, "status" | "isActive" | "startsAt" | "endsAt">,
  now: Date = new Date()
): boolean {
  if (quest.status !== "published" || !quest.isActive) return false;
  if (quest.startsAt && new Date(quest.startsAt) > now) return false;
  if (quest.endsAt && new Date(quest.endsAt) < now) return false;
  return true;
}

/** Mukofot XP si: belgilanmagan bo'lsa coin bilan teng */
export function questXp(quest: Pick<IQuest, "reward">, coins: number): number {
  return quest.reward.xp ?? coins;
}

// ---------- Standart kunlik topshiriqlar ----------

const SYSTEM_QUESTS: Array<{
  kind: QuestAutoKind;
  title: string;
  description: string;
  target: number;
  coins: (s: GamificationSettings) => number;
  xp: (s: GamificationSettings) => number;
}> = [
  {
    kind: "tests_today",
    title: "10 ta test yeching",
    description: "Bugun darslardagi testlardan 10 ta savolga javob bering.",
    target: 10,
    coins: () => 5,
    xp: () => 10,
  },
  {
    kind: "materials",
    title: "Bitta dars materialini o'qing",
    description: "Istalgan darsdagi video, fayl yoki havolani oching.",
    target: 1,
    coins: () => 3,
    xp: () => 5,
  },
  {
    kind: "login",
    title: "Platformaga kiring",
    description: "Har kuni kiring — kunlik seriyangiz davom etadi.",
    target: 1,
    coins: (s) => s.dailyLoginCoins,
    xp: (s) => s.dailyLoginCoins,
  },
];

/**
 * Kunlik odatlar (test, material, kirish) topshiriq sifatida bir marta yaratiladi — mentor ularni boshqa
 * topshiriqlar kabi tahrirlaydi yoki o'chiradi. Allaqachon bor bo'lsa tegilmaydi.
 */
export async function ensureSystemQuests(settings?: GamificationSettings): Promise<number> {
  await connectToDatabase();
  const s = settings ?? (await getAppSettings()).gamification;
  let created = 0;
  for (const def of SYSTEM_QUESTS) {
    const res = await Quest.updateOne(
      { isSystem: true, "autoRule.kind": def.kind },
      {
        $setOnInsert: {
          title: def.title,
          description: def.description,
          difficulty: "easy",
          verify: "auto",
          template: "habit",
          autoRule: { kind: def.kind, target: def.target },
          evidence: { link: "none", file: false, certId: false, note: false },
          guard: { uniqueProof: false, dateAfterJoin: false, monthlyLimit: null },
          reward: { coinsMin: def.coins(s), coinsMax: def.coins(s), xp: def.xp(s), places: [] },
          audience: { groupIds: [], grades: [] },
          repeat: "daily",
          status: "published",
          isActive: true,
          notify: { announce: false, onSubmission: false },
          isSystem: true,
          publishedAt: new Date(),
        },
      },
      { upsert: true }
    );
    created += res.upsertedCount;
  }
  return created;
}

// ---------- Faollik ----------

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}

/** Faollikni yozadi. Bir kunda bir xil (tur, ref) qayta yozilmaydi: true — yangi yozuv */
export async function recordActivity(studentId: Id, kind: ActivityKind, ref = "", correct?: boolean): Promise<boolean> {
  await connectToDatabase();
  await ActivityEvent.init();
  try {
    await ActivityEvent.create({ studentId, kind, dayKey: dayKey(), ref, ...(correct === undefined ? {} : { correct }) });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

/**
 * Kunlik kirish: o'quvchi platformani ochganda kuniga bir marta. Seriyani yangilaydi (himoya bilan), kirish voqeasini
 * yozadi va avtomatik topshiriqlarni tekshiradi. Bugun allaqachon hisoblangan bo'lsa — bitta so'rov bilan to'xtaydi.
 */
export async function dailyCheckIn(studentId: Id): Promise<void> {
  const { gamification } = await getAppSettings();
  if (!gamification.enabled) return;
  await connectToDatabase();
  const today = dayKey();
  const user = await User.findById(studentId).select("role streak streakShields").lean();
  if (!user || user.role !== "student" || user.streak?.lastDayKey === today) return;

  const step = stepStreak(user.streak, today, user.streakShields ?? 0);
  // Shartli yangilash: bir vaqtda kelgan ikki so'rovdan faqat bittasi seriyani o'zgartiradi
  const moved = await User.updateOne(
    {
      _id: user._id,
      "streak.lastDayKey": user.streak?.lastDayKey ?? null,
      ...(step.usedShield ? { streakShields: { $gte: 1 } } : {}),
    },
    { $set: { streak: step.next }, ...(step.usedShield ? { $inc: { streakShields: -1 } } : {}) }
  );
  if (moved.modifiedCount === 0) return;

  await recordActivity(user._id, "login");
  await evaluateAutoQuests(user._id, gamification);
  // Seriya nishoni: eng uzun seriya o'sgan bo'lishi mumkin (kuniga bir marta)
  await evaluateBadges(user._id);
}

// ---------- Avtomatik topshiriqlar ----------

/** Joriy davrdagi progress (avtomatik shartlar uchun) */
async function autoProgress(
  quest: IQuest,
  student: { _id: mongoose.Types.ObjectId; streak?: { current?: number } | null }
): Promise<number> {
  const rule = quest.autoRule;
  if (!rule) return 0;
  const today = dayKey();
  const sinceDay =
    quest.repeat === "daily" ? today : quest.repeat === "weekly" ? weekStartKey() : quest.repeat === "once" ? "0000-00-00" : today;
  switch (rule.kind) {
    case "tests_today":
      return ActivityEvent.countDocuments({ studentId: student._id, kind: "quiz_answer", dayKey: today });
    case "materials":
      return ActivityEvent.countDocuments({ studentId: student._id, kind: "material_view", dayKey: { $gte: sinceDay } });
    case "login":
      return (await ActivityEvent.exists({ studentId: student._id, kind: "login", dayKey: { $gte: sinceDay } })) ? 1 : 0;
    case "login_streak":
      return student.streak?.current ?? 0;
    default:
      // Davomat va guruh chellenji oy oxirida cron bilan hisoblanadi
      return 0;
  }
}

/** Avtomatik topshiriqni bajarilgan deb yozadi va mukofot beradi (davrda bir marta) */
export async function completeAutoQuest(
  quest: IQuest,
  studentId: mongoose.Types.ObjectId,
  groupId: Id | null,
  coins?: number,
  /** Oylik yakunlar uchun ("m:2026-10") */
  periodKeyOverride?: string
): Promise<boolean> {
  const periodKey = periodKeyOverride ?? periodKeyFor(quest.repeat) ?? `d:${dayKey()}`;
  const reward = coins ?? quest.reward.coinsMin;
  const xp = questXp(quest, reward);
  await QuestSubmission.init();
  try {
    await QuestSubmission.create({
      questId: quest._id,
      studentId,
      groupId,
      status: "approved",
      auto: true,
      periodKey,
      monthKey: monthKey(),
      coins: reward,
      xp,
      reviewedAt: new Date(),
      submittedAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
  if (reward > 0 || xp > 0) {
    await awardCoins({
      studentId,
      coin: reward,
      xp,
      type: quest.autoRule?.kind === "login" ? "login" : "quest",
      referenceId: quest._id,
      description: `Topshiriq: ${quest.title}`,
      idempotencyKey: `quest:auto:${quest._id}:${studentId}:${periodKey}`,
    });
  }
  return true;
}

const REALTIME_KINDS: QuestAutoKind[] = ["tests_today", "materials", "login", "login_streak"];

/** O'quvchining ochiq avtomatik topshiriqlarini tekshiradi; shart bajarilganlarini yozib, mukofot beradi */
export async function evaluateAutoQuests(studentId: Id, settings?: GamificationSettings): Promise<number> {
  const s = settings ?? (await getAppSettings()).gamification;
  if (!s.enabled) return 0;
  await connectToDatabase();
  const scope = await loadStudentScope(studentId);
  if (!scope) return 0;
  const student = await User.findById(scope._id).select("streak").lean();

  const quests = await Quest.find({ status: "published", isActive: true, verify: "auto", "autoRule.kind": { $in: REALTIME_KINDS } });
  let completed = 0;
  for (const quest of quests) {
    if (!questOpen(quest) || !questVisibleTo(quest, scope)) continue;
    const periodKey = periodKeyFor(quest.repeat) ?? `d:${dayKey()}`;
    const done = await QuestSubmission.exists({ questId: quest._id, studentId: scope._id, periodKey, auto: true });
    if (done) continue;
    const progress = await autoProgress(quest, { _id: scope._id, streak: student?.streak });
    if (progress >= (quest.autoRule?.target ?? 1) && (await completeAutoQuest(quest, scope._id, scope.groupId))) completed++;
  }
  return completed;
}

/** O'quvchi sahifasi uchun: avtomatik topshiriqning joriy davrdagi progressi */
export async function autoProgressFor(quest: IQuest, studentId: mongoose.Types.ObjectId): Promise<number> {
  const student = await User.findById(studentId).select("streak").lean();
  return autoProgress(quest, { _id: studentId, streak: student?.streak });
}

/** Dars materiali ochildi (fayl, video yoki havola). Bir kunda bir material bir marta sanaladi */
export async function trackMaterialView(studentId: Id, materialKey: string): Promise<void> {
  const { gamification } = await getAppSettings();
  if (!gamification.enabled) return;
  const isNew = await recordActivity(studentId, "material_view", materialKey.slice(0, 300));
  if (isNew) await evaluateAutoQuests(studentId, gamification);
}
