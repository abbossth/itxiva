"use server";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Quest, type IQuest } from "@/lib/db/models/quest.model";
import { QuestSubmission } from "@/lib/db/models/quest-submission.model";
import { ActivityEvent } from "@/lib/db/models/activity-event.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { User } from "@/lib/db/models/user.model";
import { requireStudent } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { buildLevels, levelProgress } from "@/lib/gamification/levels";
import { toQuestView, type QuestView } from "@/lib/gamification/quest-view";
import { autoProgressFor, evaluateAutoQuests, loadStudentScope, questOpen, questVisibleTo } from "@/lib/gamification/quests";
import { dayKey, monthKey, periodKeyFor, weekStartKey } from "@/lib/gamification/periods";
import { addDaysToKey } from "@/lib/schedule";
import { LEGACY_EARNING_TYPES } from "@/lib/gamification/backfill";
import type { LevelSummary } from "./gamification.actions";
import { Group } from "@/lib/db/models/group.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { StudentBadge } from "@/lib/db/models/student-badge.model";
import { badgeMetrics, groupMonthAttendance } from "@/lib/gamification/achievements";
import { BADGES, nextTier, type BadgeId, type BadgeTier } from "@/lib/gamification/badges";
import { effectiveStreak } from "@/lib/gamification/streak";
import { groupShortName } from "@/lib/group-name";
import { dateFromKey } from "@/lib/schedule";

export type StudentQuestState = "available" | "pending" | "done" | "rejected" | "limit";

export interface StudentQuestCard {
  quest: QuestView;
  state: StudentQuestState;
  /** Avtomatik topshiriq: joriy davrdagi progress */
  progress: { current: number; target: number } | null;
  doneAt: string | null;
  /** Tekshiruvdagi yuborishlar (cheksiz topshiriqda bir nechta bo'lishi mumkin) */
  pendingCount: number;
  /** Oylik limit: shu oy yuborilgan / limit */
  monthUsed: number;
  rejectReason: string | null;
}

export interface StudentQuestsData {
  level: LevelSummary;
  groupRank: number | null;
  weekXp: number;
  streak: {
    current: number;
    best: number;
    shields: number;
    /** Dushanbadan yakshanbagacha */
    week: { label: string; state: "done" | "today" | "missed" | "future" }[];
  };
  daily: StudentQuestCard[];
  weekly: (StudentQuestCard & { participants: number }) | null;
  main: StudentQuestCard[];
  counts: { active: number; pending: number; done: number };
  /** Keyingi bosqichga eng yaqin ikkita marra */
  milestones: MilestoneView[];
  /** Ochiq guruh chellenji (joriy oy davomati) */
  challenge: ChallengeView | null;
}

export interface MilestoneView {
  id: BadgeId;
  title: string;
  description: string;
  unit: string;
  value: number;
  tiers: { tier: BadgeTier; threshold: number; coins: number; owned: boolean }[];
  next: { tier: BadgeTier; threshold: number; coins: number } | null;
}

export interface ChallengeView {
  title: string;
  target: number;
  coins: number;
  daysLeft: number;
  groups: { name: string; rate: number; mine: boolean }[];
}

const WEEK_LABELS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

async function questCard(quest: IQuest, studentId: mongoose.Types.ObjectId): Promise<StudentQuestCard> {
  const period = periodKeyFor(quest.repeat);
  const subs = await QuestSubmission.find({ questId: quest._id, studentId }).sort({ submittedAt: -1 }).lean();
  const inPeriod = period ? subs.filter((s) => s.periodKey === period) : subs;
  const approved = inPeriod.find((s) => s.status === "approved");
  const pending = inPeriod.filter((s) => s.status === "pending");
  const monthUsed = subs.filter((s) => s.monthKey === monthKey() && s.status !== "rejected").length;
  const latest = inPeriod[0];

  let state: StudentQuestState = "available";
  if (quest.verify === "auto" || quest.repeat !== "unlimited") {
    if (approved) state = "done";
    else if (pending.length) state = "pending";
    else if (latest?.status === "rejected") state = "rejected";
  } else if (latest?.status === "rejected" && !pending.length) {
    state = "rejected";
  }
  if (state !== "done" && state !== "pending" && quest.guard?.monthlyLimit && monthUsed >= quest.guard.monthlyLimit) state = "limit";

  const progress =
    quest.verify === "auto" && quest.autoRule
      ? { current: Math.min(await autoProgressFor(quest, studentId), quest.autoRule.target), target: quest.autoRule.target }
      : null;

  return {
    quest: toQuestView(quest),
    state,
    progress,
    doneAt: approved ? new Date(approved.reviewedAt ?? approved.submittedAt).toISOString() : null,
    pendingCount: pending.length,
    monthUsed,
    rejectReason: state === "rejected" ? latest?.rejectReason || null : null,
  };
}

/** O'quvchining Topshiriqlar sahifasi (01/05) */
export async function getStudentQuestsData(): Promise<StudentQuestsData | null> {
  const session = await requireStudent();
  const { gamification } = await getAppSettings();
  if (!gamification.enabled) return null;
  await connectToDatabase();

  const scope = await loadStudentScope(session.userId);
  if (!scope) return null;
  // Sahifa ochilganda ham shartlar tekshiriladi (masalan, kecha boshlangan seriya)
  await evaluateAutoQuests(scope._id, gamification);

  const user = await User.findById(scope._id).select("xp spendableBalance streak streakShields groupId").lean();
  if (!user) return null;
  const p = levelProgress(user.xp ?? 0, buildLevels(gamification.levelThresholds));
  const level: LevelSummary = {
    level: p.current.level,
    name: p.current.name,
    xp: p.xp,
    nextXp: p.next?.minXp ?? null,
    nextName: p.next?.name ?? null,
    percent: p.percent,
    toNext: p.toNext,
    balance: user.spendableBalance ?? 0,
  };

  const [ahead, weekRow] = await Promise.all([
    user.groupId
      ? User.countDocuments({ role: "student", groupId: user.groupId, isHiddenFromLeaderboard: { $ne: true }, xp: { $gt: user.xp ?? 0 } })
      : Promise.resolve(null),
    CoinLedger.aggregate<{ sum: number }>([
      { $match: { studentId: scope._id, createdAt: { $gte: new Date(Date.now() - 7 * 86_400_000) }, type: { $ne: "purchase" } } },
      { $group: { _id: null, sum: { $sum: { $ifNull: ["$xp", { $cond: [{ $in: ["$type", LEGACY_EARNING_TYPES] }, "$amount", 0] }] } } } },
    ]),
  ]);

  // Seriya: shu haftaning kunlari
  const today = dayKey();
  const monday = weekStartKey();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
  const logins = new Set(
    (await ActivityEvent.find({ studentId: scope._id, kind: "login", dayKey: { $in: weekDays } }).select("dayKey").lean()).map((e) => e.dayKey)
  );
  const week = weekDays.map((d, i) => ({
    label: WEEK_LABELS[i],
    state: (d === today ? "today" : d > today ? "future" : logins.has(d) ? "done" : "missed") as "done" | "today" | "missed" | "future",
  }));

  const quests = (await Quest.find({ status: "published", isActive: true }).sort({ createdAt: -1 })).filter(
    (q) => questOpen(q) && questVisibleTo(q, scope)
  );
  const cards = await Promise.all(quests.map((q) => questCard(q, scope._id)));
  const daily = cards.filter((c) => c.quest.verify === "auto" && c.quest.repeat === "daily");
  const weeklyCard = cards.find((c) => c.quest.verify === "competition") ?? null;
  const main = cards.filter((c) => !daily.includes(c) && c !== weeklyCard && c.quest.autoRule?.kind !== "group_challenge");

  let weekly: StudentQuestsData["weekly"] = null;
  if (weeklyCard) {
    const participants = await QuestSubmission.distinct("studentId", {
      questId: new mongoose.Types.ObjectId(weeklyCard.quest._id),
      periodKey: periodKeyFor("weekly"),
    });
    weekly = { ...weeklyCard, participants: participants.length };
  }

  const all = [...daily, ...main, ...(weeklyCard ? [weeklyCard] : [])];

  // Marralar: keyingi bosqichga eng yaqin ikkitasi
  const [metrics, owned] = await Promise.all([
    badgeMetrics(scope._id),
    StudentBadge.find({ studentId: scope._id }).select("badge tier").lean(),
  ]);
  const ownedSet = new Set(owned.map((b) => `${b.badge}:${b.tier}`));
  const milestones: MilestoneView[] = BADGES.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    unit: b.unit,
    value: metrics[b.id],
    tiers: b.tiers.map((t) => ({ ...t, owned: ownedSet.has(`${b.id}:${t.tier}`) })),
    next: nextTier(b, metrics[b.id]),
  }))
    .filter((m) => m.next)
    .sort((a, b) => b.value / b.next!.threshold - a.value / a.next!.threshold)
    .slice(0, 2);

  // Guruh chellenji: joriy oyning shu kungacha bo'lgan davomati
  let challenge: ChallengeView | null = null;
  const challengeQuest = quests.find((q) => q.autoRule?.kind === "group_challenge");
  if (challengeQuest?.autoRule) {
    const gids = (challengeQuest.audience?.groupIds ?? []).map(String);
    const grades = challengeQuest.audience?.grades ?? [];
    const groups = await Group.find({
      isActive: true,
      ...(gids.length || grades.length ? { $or: [{ _id: { $in: gids } }, { grade: { $in: grades } }] } : {}),
    })
      .select("name shortName")
      .lean();
    const rates = await groupMonthAttendance(monthKey(), groups.map((g) => g._id));
    const [y, m] = monthKey().split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    challenge = {
      title: challengeQuest.title,
      target: challengeQuest.autoRule.target,
      coins: challengeQuest.reward.coinsMin,
      daysLeft: Math.max(0, Math.ceil((dateFromKey(nextMonth).getTime() - Date.now()) / 86_400_000)),
      groups: groups
        .map((g) => ({ name: groupShortName(g), rate: rates.get(String(g._id)) ?? 0, mine: String(g._id) === String(scope.groupId) }))
        .sort((a, b) => b.rate - a.rate),
    };
  }
  return {
    level,
    groupRank: ahead === null ? null : ahead + 1,
    weekXp: weekRow[0]?.sum ?? 0,
    streak: {
      current: effectiveStreak(user.streak, today, user.streakShields ?? 0),
      best: user.streak?.best ?? 0,
      shields: user.streakShields ?? 0,
      week,
    },
    daily,
    weekly,
    main,
    counts: {
      active: all.filter((c) => c.state === "available" || c.state === "rejected").length,
      pending: all.reduce((s, c) => s + c.pendingCount, 0),
      done: all.filter((c) => c.state === "done").length,
    },
    milestones,
    challenge,
  };
}

// ---------- Yutuqlarim (03/07) ----------

export interface AchievementsData {
  profile: { fullName: string; groupName: string; grade: number | null; joinedAt: string | null };
  level: LevelSummary;
  streak: number;
  badgesOwned: number;
  badgesTotal: number;
  levelUpBonus: number;
  levels: { level: number; name: string; minXp: number; state: "passed" | "current" | "future" }[];
  badges: { id: BadgeId; title: string; description: string; value: number; tier: BadgeTier | null; next: { tier: BadgeTier; threshold: number } | null }[];
  path: { quarter: number; total: number; done: number; state: "done" | "current" | "future"; nextLesson: string | null }[];
  submissions: { _id: string; questId: string; title: string; detail: string; date: string; status: "pending" | "approved" | "rejected"; coins: number; reason: string; revoked: boolean }[];
}

const TIER_RANK: Record<BadgeTier, number> = { bronze: 1, silver: 2, gold: 3 };

export async function getAchievementsData(): Promise<AchievementsData | null> {
  const session = await requireStudent();
  const settings = await getAppSettings();
  const { gamification } = settings;
  if (!gamification.enabled) return null;
  await connectToDatabase();
  const user = await User.findById(session.userId).select("fullName groupId createdAt xp spendableBalance streak streakShields").lean();
  if (!user) return null;
  const group = user.groupId ? await Group.findById(user.groupId).select("name shortName grade").lean() : null;

  const levels = buildLevels(gamification.levelThresholds);
  const p = levelProgress(user.xp ?? 0, levels);

  const [metrics, owned, subs] = await Promise.all([
    badgeMetrics(user._id),
    StudentBadge.find({ studentId: user._id }).select("badge tier").lean(),
    QuestSubmission.find({ studentId: user._id, auto: false }).sort({ submittedAt: -1 }).limit(20).lean(),
  ]);
  const quests = await Quest.find({ _id: { $in: [...new Set(subs.map((s) => String(s.questId)))] } }).select("title").lean();
  const questTitle = new Map(quests.map((q) => [String(q._id), q.title]));

  // O'qish yo'li: guruhning nashr etilgan darslari choraklar bo'yicha; tugatilgan — vazifa topshirilgan yoki test yechilgan
  const lessons = user.groupId
    ? await Lesson.find({ groupId: user.groupId, isPublished: true }).select("title quarter order").sort({ quarter: 1, order: 1 }).lean()
    : [];
  const lessonIds = lessons.map((l) => l._id);
  const [hw, quiz] = await Promise.all([
    HomeworkSubmission.distinct("lessonId", { studentId: user._id, lessonId: { $in: lessonIds }, status: { $in: ["submitted", "graded"] } }),
    QuizSubmission.distinct("lessonId", { studentId: user._id, lessonId: { $in: lessonIds } }),
  ]);
  const doneSet = new Set([...hw, ...quiz].map(String));
  const path = [1, 2, 3, 4]
    .map((quarter) => {
      const qLessons = lessons.filter((l) => l.quarter === quarter);
      const done = qLessons.filter((l) => doneSet.has(String(l._id))).length;
      const state: "done" | "current" | "future" =
        quarter === settings.quarter ? "current" : quarter < settings.quarter ? "done" : "future";
      return {
        quarter,
        total: qLessons.length,
        done,
        state,
        nextLesson: qLessons.find((l) => !doneSet.has(String(l._id)))?.title ?? null,
      };
    })
    .filter((q) => q.total > 0 || q.state !== "done");

  return {
    profile: {
      fullName: user.fullName,
      groupName: group ? groupShortName(group) : "",
      grade: group?.grade ?? null,
      joinedAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
    },
    level: {
      level: p.current.level,
      name: p.current.name,
      xp: p.xp,
      nextXp: p.next?.minXp ?? null,
      nextName: p.next?.name ?? null,
      percent: p.percent,
      toNext: p.toNext,
      balance: user.spendableBalance ?? 0,
    },
    streak: effectiveStreak(user.streak, dayKey(), user.streakShields ?? 0),
    badgesOwned: owned.length,
    badgesTotal: BADGES.reduce((s, b) => s + b.tiers.length, 0),
    levelUpBonus: gamification.levelUpBonus,
    levels: levels.map((l) => ({ ...l, state: l.level < p.current.level ? "passed" : l.level === p.current.level ? "current" : "future" })),
    badges: BADGES.map((b) => {
      const tiers = owned.filter((o) => o.badge === b.id).map((o) => o.tier as BadgeTier);
      const top = tiers.sort((x, y) => TIER_RANK[y] - TIER_RANK[x])[0] ?? null;
      const n = nextTier(b, metrics[b.id]);
      return { id: b.id, title: b.title, description: b.description, value: metrics[b.id], tier: top, next: n ? { tier: n.tier, threshold: n.threshold } : null };
    }),
    path,
    submissions: subs.map((s) => ({
      _id: String(s._id),
      questId: String(s.questId),
      title: questTitle.get(String(s.questId)) ?? "Topshiriq",
      detail: [s.evidence?.platform, s.evidence?.courseName].filter(Boolean).join(" · "),
      date: new Date(s.submittedAt).toISOString(),
      status: s.status,
      coins: s.coins ?? 0,
      reason: s.rejectReason ?? "",
      revoked: Boolean(s.revokedAt),
    })),
  };
}
