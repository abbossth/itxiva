import mongoose, { type ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger, type CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
import { LevelReward } from "@/lib/db/models/level-reward.model";
import { getAppSettings } from "@/lib/settings";
import { notify } from "@/lib/notifications/notify";
import { buildLevels, levelForXp } from "./levels";
import type { GamificationSettings } from "./config";

// Coin va XP berishning yagona yo'li. Har bir mukofot ledger'ga yoziladi; `idempotencyKey` berilsa,
// xuddi shu mukofot ikki marta berilmaydi (ikki marta bosish, cron qayta ishlashi, parallel so'rov).

type Id = string | mongoose.Types.ObjectId;

export interface AwardInput {
  studentId: Id;
  /** Balans o'zgarishi (manfiy — yechish) */
  coin: number;
  /** XP o'zgarishi. Berilmasa: musbat coin bilan teng, manfiyda 0 (jarima XP ni kamaytirmaydi) */
  xp?: number;
  type: CoinTransactionType;
  description: string;
  referenceId?: Id | null;
  idempotencyKey?: string;
  /** Eski reyting hisobi (`totalCoins`) ham o'zgaradimi. Sukutda: xariddan boshqa hamma amallarda */
  affectsTotal?: boolean;
  /** Telegram "coin o'zgarishi" xabari uchun sabab; berilmasa xabar yuborilmaydi */
  notifyReason?: string;
  session?: ClientSession;
}

export type AwardResult =
  | { ok: true; applied: boolean; balance: number; xp: number }
  | { ok: false; reason: "insufficient" | "not_found" };

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}

/**
 * Idempotentlik unique indekslarga tayanadi: ular hali qurilmagan bo'lsa (yangi baza, deploydan keyingi birinchi so'rov)
 * takroriy yozuv o'tib ketishi mumkin. `init()` indeks tayyor bo'lishini kutadi (natijasi keshlanadi).
 */
async function ensureIndexes() {
  await Promise.all([CoinLedger.init(), LevelReward.init()]);
}

export async function awardCoins(input: AwardInput): Promise<AwardResult> {
  await connectToDatabase();
  await ensureIndexes();
  const coin = Math.round(input.coin);
  const xp = Math.round(input.xp ?? Math.max(coin, 0));
  const affectsTotal = input.affectsTotal ?? input.type !== "purchase";
  const session = input.session;
  const studentId = new mongoose.Types.ObjectId(String(input.studentId));

  const current = async (applied: boolean): Promise<AwardResult> => {
    const u = await User.findById(studentId).select("spendableBalance xp").session(session ?? null).lean();
    return u ? { ok: true, applied, balance: u.spendableBalance ?? 0, xp: u.xp ?? 0 } : { ok: false, reason: "not_found" };
  };

  // 1. Mukofotni "band qilish": kalitli yozuv birinchi bo'lib yaratiladi — ikkinchi urinish shu yerda to'xtaydi
  let ledgerId: mongoose.Types.ObjectId;
  try {
    const [entry] = await CoinLedger.create(
      [
        {
          studentId,
          amount: coin,
          xp,
          type: input.type,
          referenceId: input.referenceId ?? null,
          description: input.description,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        },
      ],
      { session }
    );
    ledgerId = entry._id;
  } catch (error) {
    if (input.idempotencyKey && isDuplicateKey(error)) return current(false);
    throw error;
  }

  // 2. Hisoblarni o'zgartirish: balans manfiyga tushmaydi, XP noldan pastga tushmaydi
  const updated = await User.findOneAndUpdate(
    { _id: studentId, role: "student", ...(coin < 0 ? { spendableBalance: { $gte: -coin } } : {}) },
    [
      {
        $set: {
          spendableBalance: { $add: [{ $ifNull: ["$spendableBalance", 0] }, coin] },
          totalCoins: { $add: [{ $ifNull: ["$totalCoins", 0] }, affectsTotal ? coin : 0] },
          xp: { $max: [0, { $add: [{ $ifNull: ["$xp", 0] }, xp] }] },
        },
      },
    ],
    { returnDocument: "after", session, updatePipeline: true }
  )
    .select("spendableBalance totalCoins xp")
    .lean();

  if (!updated) {
    await CoinLedger.deleteOne({ _id: ledgerId }, { session });
    const exists = await User.exists({ _id: studentId, role: "student" }).session(session ?? null);
    return { ok: false, reason: exists ? "insufficient" : "not_found" };
  }

  await CoinLedger.updateOne({ _id: ledgerId }, { $set: { balanceAfter: updated.spendableBalance } }, { session });

  // Tranzaksiya ichida tashqi ta'sir bo'lmasin: daraja va xabar — chaqiruvchi tranzaksiyadan keyin qiladi
  if (!session) {
    if (xp > 0) await syncLevel(studentId);
    if (input.notifyReason && coin !== 0) {
      notify(studentId, "coins_changed", { amount: coin, reason: input.notifyReason, balance: updated.spendableBalance });
    }
  }
  return { ok: true, applied: true, balance: updated.spendableBalance ?? 0, xp: updated.xp ?? 0 };
}

/**
 * XP ga qarab darajani yangilaydi: yangi har bir daraja uchun bonus (bir martalik — LevelReward unique),
 * tabrik oynasi belgisi va Telegram xabari. Daraja hech qachon pasaymaydi. Gamifikatsiya o'chiq bo'lsa — hech narsa.
 */
export async function syncLevel(studentId: Id, settings?: GamificationSettings): Promise<number[]> {
  const s = settings ?? (await getAppSettings()).gamification;
  if (!s.enabled) return [];
  await ensureIndexes();
  const user = await User.findById(studentId).select("xp level role").lean();
  if (!user || user.role !== "student") return [];

  const levels = buildLevels(s.levelThresholds);
  const from = user.level ?? 1;
  const target = levelForXp(user.xp ?? 0, levels);
  if (target.level <= from) return [];

  // Shartli yangilash: parallel chaqiruvlardan faqat bittasi darajani ko'taradi
  const moved = await User.updateOne(
    { _id: user._id, level: from },
    { $set: { level: target.level, pendingLevelUp: target.level } }
  );
  if (moved.modifiedCount === 0) return [];

  const reached: number[] = [];
  let bonusTotal = 0;
  for (let level = from + 1; level <= target.level; level++) {
    try {
      await LevelReward.create({ studentId: user._id, level, coins: s.levelUpBonus });
    } catch (error) {
      if (isDuplicateKey(error)) continue;
      throw error;
    }
    reached.push(level);
    if (s.levelUpBonus > 0) {
      const def = levels[level - 1];
      const res = await awardCoins({
        studentId: user._id,
        coin: s.levelUpBonus,
        xp: 0,
        type: "level",
        description: `${level}-daraja bonusi: ${def.name}`,
        idempotencyKey: `level:${user._id}:${level}`,
      });
      if (res.ok && res.applied) bonusTotal += s.levelUpBonus;
    }
  }

  if (reached.length > 0) {
    notify(user._id, "level_up", { level: target.level, name: target.name, bonus: bonusTotal });
  }
  return reached;
}
