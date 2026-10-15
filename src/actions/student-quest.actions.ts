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
  return {
    level,
    groupRank: ahead === null ? null : ahead + 1,
    weekXp: weekRow[0]?.sum ?? 0,
    streak: { current: user.streak?.current ?? 0, best: user.streak?.best ?? 0, shields: user.streakShields ?? 0, week },
    daily,
    weekly,
    main,
    counts: {
      active: all.filter((c) => c.state === "available" || c.state === "rejected").length,
      pending: all.reduce((s, c) => s + c.pendingCount, 0),
      done: all.filter((c) => c.state === "done").length,
    },
  };
}
