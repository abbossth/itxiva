"use server";

import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger, type CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
import { getCurrentUser } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { COIN_TYPE_LABELS } from "@/lib/coin-types";
import { buildLevels, levelProgress } from "@/lib/gamification/levels";

// Mukofot tabrigi: o'quvchi oxirgi ko'rganidan keyin olgan coin va XP (o'yindagidek katta oynada ko'rsatiladi).
// Manbadan qat'i nazar ishlaydi: davomat, test, vazifa bahosi, topshiriq tasdig'i, nishon, kunlik kirish.

/** Mukofot emas: xarid, qaytarish/jarima, XP tenglashtirish. Daraja bonusini daraja oynasi ko'rsatadi */
const NOT_REWARD: CoinTransactionType[] = ["purchase", "adjustment", "xp_align", "level"];

export interface RewardSummary {
  coins: number;
  xp: number;
  /** Manbalar bo'yicha (ko'pidan kamiga) */
  items: { type: CoinTransactionType; label: string; coins: number; xp: number; count: number; description: string }[];
  /** Ko'rsatilgan oxirgi yozuv vaqti — tasdiqlashda shu yuboriladi */
  until: string;
  balance: number;
  /** Konfetti, ovoz va titrash (o'quvchi profilda o'chirib qo'yishi mumkin) */
  effects: boolean;
  /** Gamifikatsiya yoqilgan bo'lsa: XP chizig'i oldin va keyin */
  level: { level: number; name: string; percentBefore: number; percentAfter: number; toNext: number; nextName: string | null } | null;
}

/** Hali ko'rsatilmagan mukofotlar. Birinchi chaqiruvda hisob boshlanadi (eski tarix ko'rsatilmaydi) */
export async function getUnseenRewardsAction(): Promise<RewardSummary | null> {
  const session = await getCurrentUser();
  if (session?.role !== "student") return null;
  await connectToDatabase();

  const user = await User.findById(session.userId).select("rewardsSeenAt spendableBalance xp celebrationsEnabled").lean();
  if (!user) return null;
  if (!user.rewardsSeenAt) {
    await User.updateOne({ _id: user._id, rewardsSeenAt: null }, { $set: { rewardsSeenAt: new Date() } });
    return null;
  }

  const rows = await CoinLedger.find({
    studentId: user._id,
    createdAt: { $gt: user.rewardsSeenAt },
    type: { $nin: NOT_REWARD },
    $or: [{ amount: { $gt: 0 } }, { xp: { $gt: 0 } }],
  })
    .select("amount xp type description createdAt")
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
  if (rows.length === 0) return null;

  const byType = new Map<CoinTransactionType, RewardSummary["items"][number]>();
  let coins = 0;
  let xp = 0;
  for (const r of rows) {
    const c = Math.max(0, r.amount);
    const x = Math.max(0, r.xp ?? 0);
    coins += c;
    xp += x;
    const item = byType.get(r.type) ?? { type: r.type, label: COIN_TYPE_LABELS[r.type], coins: 0, xp: 0, count: 0, description: "" };
    item.coins += c;
    item.xp += x;
    item.count++;
    item.description = r.description;
    byType.set(r.type, item);
  }

  const { gamification } = await getAppSettings();
  let level: RewardSummary["level"] = null;
  if (gamification.enabled) {
    const levels = buildLevels(gamification.levelThresholds);
    const after = levelProgress(user.xp ?? 0, levels);
    const before = levelProgress(Math.max(0, (user.xp ?? 0) - xp), levels);
    level = {
      level: after.current.level,
      name: after.current.name,
      // Shu oynada daraja o'zgargan bo'lsa chiziq noldan to'ladi (daraja oynasi alohida tabriklaydi)
      percentBefore: before.current.level === after.current.level ? before.percent : 0,
      percentAfter: after.percent,
      toNext: after.toNext,
      nextName: after.next?.name ?? null,
    };
  }

  return {
    coins,
    xp: gamification.enabled ? xp : 0,
    items: [...byType.values()].sort((a, b) => b.coins + b.xp - (a.coins + a.xp)),
    until: new Date(rows[rows.length - 1].createdAt as Date).toISOString(),
    balance: user.spendableBalance ?? 0,
    effects: user.celebrationsEnabled !== false,
    level,
  };
}

/** Tabrik ko'rildi: shu vaqtgacha bo'lgan mukofotlar qayta ko'rsatilmaydi */
export async function acknowledgeRewardsAction(until: unknown): Promise<void> {
  const session = await getCurrentUser();
  if (session?.role !== "student" || typeof until !== "string") return;
  const at = new Date(until);
  // Kelajakdagi sana bilan keyingi mukofotlarni yashirib bo'lmaydi
  if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000) return;
  await connectToDatabase();
  await User.updateOne({ _id: session.userId }, { $max: { rewardsSeenAt: at } });
}
