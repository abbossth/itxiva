"use server";

import { connectToDatabase } from "@/lib/db/connect";
import { CoinLedger, type CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
import { User } from "@/lib/db/models/user.model";
import { Product } from "@/lib/db/models/product.model";
import { Group } from "@/lib/db/models/group.model";
import { Quest } from "@/lib/db/models/quest.model";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { requireMentor } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { ATTENDANCE_COINS } from "@/lib/attendance-status";
import { COIN_TYPE_LABELS } from "@/lib/coin-types";
import type { GamificationSettings } from "@/lib/gamification/config";

// Coin iqtisodiyoti (11): coin qanchalik tez yig'iladi va do'kon narxlari bilan muvozanat.

/** Manfiy davomat yozuvlari va do'kon qaytarishlari "adjustment" — ular daromad emas */
const EARNING_EXCLUDE: CoinTransactionType[] = ["purchase", "adjustment"];

export interface CoinEconomy {
  days: number;
  students: number;
  given: number;
  /** O'rtacha o'quvchining 30 kunlik daromadi */
  perStudentMonthly: number;
  spent: number;
  topEarner: number;
  cheapest: { title: string; price: number } | null;
  sources: { type: CoinTransactionType; label: string; amount: number }[];
  products: { title: string; price: number; kind: string; monthsNow: number | null; monthsPlan: number }[];
  /** Eng arzon mahsulotga o'rtacha o'quvchi 3 oydan ko'p yig'adimi */
  warning: boolean;
  plan: {
    lessonsPerMonth: number;
    attendanceCoins: number;
    loginDays: number;
    loginCoins: number;
    dailyQuestDays: number;
    dailyQuestCoins: number;
  };
  settings: GamificationSettings;
}

export async function getCoinEconomy(daysRaw: number): Promise<CoinEconomy> {
  await requireMentor();
  await connectToDatabase();
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const { gamification } = await getAppSettings();

  const [students, byType, spentRow, perStudent, products, groups, sessions, testsQuest] = await Promise.all([
    User.countDocuments({ role: "student", groupId: { $ne: null } }),
    CoinLedger.aggregate<{ _id: CoinTransactionType; sum: number }>([
      { $match: { createdAt: { $gte: since }, amount: { $gt: 0 }, type: { $nin: EARNING_EXCLUDE } } },
      { $group: { _id: "$type", sum: { $sum: "$amount" } } },
    ]),
    CoinLedger.aggregate<{ sum: number }>([
      { $match: { createdAt: { $gte: since }, type: "purchase" } },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]),
    CoinLedger.aggregate<{ sum: number }>([
      { $match: { createdAt: { $gte: since }, amount: { $gt: 0 }, type: { $nin: EARNING_EXCLUDE } } },
      { $group: { _id: "$studentId", sum: { $sum: "$amount" } } },
      { $sort: { sum: -1 } },
      { $limit: 1 },
    ]),
    Product.find({ isActive: true }).select("title price kind").sort({ price: 1 }).lean(),
    Group.countDocuments({ isActive: true }),
    AttendanceSession.countDocuments({ date: { $gte: new Date(Date.now() - 30 * 86_400_000) } }),
    Quest.findOne({ isSystem: true, "autoRule.kind": "tests_today" }).select("reward").lean(),
  ]);

  const given = byType.reduce((s, r) => s + r.sum, 0);
  const perStudentMonthly = students > 0 ? Math.round((given / students) * (30 / days)) : 0;
  const material = products.filter((p) => p.kind !== "streak_shield");
  const cheapest = material[0] ? { title: material[0].title, price: material[0].price } : null;
  const target = gamification.monthlyCoinTarget;

  // Reja: oyiga darslar soni haqiqiy davomatdan (guruh boshiga), bo'lmasa haftasiga 3 ta
  const lessonsPerMonth = groups > 0 && sessions > 0 ? Math.round(sessions / groups) : 12;

  return {
    days,
    students,
    given,
    perStudentMonthly,
    spent: Math.abs(spentRow[0]?.sum ?? 0),
    topEarner: perStudent[0]?.sum ?? 0,
    cheapest,
    sources: byType
      .map((r) => ({ type: r._id, label: COIN_TYPE_LABELS[r._id] ?? r._id, amount: r.sum }))
      .sort((a, b) => b.amount - a.amount),
    products: products.map((p) => ({
      title: p.title,
      price: p.price,
      kind: p.kind ?? "item",
      monthsNow: perStudentMonthly > 0 ? p.price / perStudentMonthly : null,
      monthsPlan: p.price / target,
    })),
    warning: Boolean(cheapest && (perStudentMonthly === 0 || cheapest.price / perStudentMonthly > 3)),
    plan: {
      lessonsPerMonth,
      attendanceCoins: ATTENDANCE_COINS.present,
      loginDays: 20,
      loginCoins: gamification.dailyLoginCoins,
      dailyQuestDays: 10,
      dailyQuestCoins: testsQuest?.reward.coinsMin ?? 5,
    },
    settings: gamification,
  };
}
