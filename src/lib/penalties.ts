import mongoose from "mongoose";
import { Penalty, type IPenalty, type PenaltyKind } from "@/lib/db/models/penalty.model";
import { User } from "@/lib/db/models/user.model";
import { monthKeyOf, penaltyAmount, penaltyOrdinalLabel } from "@/lib/penalty-ladder";

export * from "@/lib/penalty-ladder";

// Jarimalarni yozish va balansdan yechish (server). Zinapoya qoidasi — src/lib/penalty-ladder.ts.
// Sababsiz dars qoldirish va topshirilmagan uyga vazifa alohida sanaladi. Bu fayl "use server" emas.

type Id = string | mongoose.Types.ObjectId;

export const PENALTY_REASON_BASE: Record<PenaltyKind, string> = {
  absence: "Darsga sababsiz kelmagani uchun",
  homework: "Uyga vazifa muddatida topshirilmagani uchun",
};

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: number })?.code === 11000;
}

/**
 * Jarima yozuvini oladi yoki yaratadi. Yangi yozuvda oydagi tartib va zinapoya summasi shu paytda belgilanadi
 * va keyin o'zgarmaydi (holat qayta saqlansa ham summa siljimaydi).
 */
export async function ensurePenalty(params: {
  studentId: Id;
  kind: PenaltyKind;
  refId: Id;
  /** Jarima qaysi oyga tegishli (dars yoki vazifa muddati sanasi) */
  at: Date | string;
  /** Sababning boshi: "«Word» uyga vazifasi muddatida topshirilmagani uchun"; berilmasa umumiy matn */
  reasonBase?: string;
}): Promise<{ penalty: IPenalty; created: boolean }> {
  const filter = { kind: params.kind, refId: params.refId, studentId: params.studentId };
  const existing = await Penalty.findOne(filter);
  if (existing) return { penalty: existing, created: false };

  await Penalty.init();
  const monthKey = monthKeyOf(params.at);
  const no = (await Penalty.countDocuments({ studentId: params.studentId, kind: params.kind, monthKey })) + 1;
  const base = params.reasonBase ?? PENALTY_REASON_BASE[params.kind];
  try {
    const penalty = await Penalty.create({
      ...filter,
      monthKey,
      no,
      wanted: penaltyAmount(no),
      applied: 0,
      reason: `${base} (${penaltyOrdinalLabel(monthKey, no)})`,
    });
    return { penalty, created: true };
  } catch (error) {
    // Parallel chaqiruv birinchi bo'lib yaratgan
    if (!isDuplicateKey(error)) throw error;
    const again = await Penalty.findOne(filter);
    if (!again) throw error;
    return { penalty: again, created: false };
  }
}

/**
 * Balansdan `wanted` coin yechadi, lekin 0 dan pastga tushirmaydi (reyting hisobi `totalCoins` ham).
 * XP o'zgarmaydi. Haqiqatda yechilgan miqdor va yangi balans qaytadi.
 */
export async function deductClamped(studentId: Id, wanted: number): Promise<{ applied: number; balanceAfter: number; totalAfter: number }> {
  const before = await User.findOneAndUpdate(
    { _id: studentId },
    [
      {
        $set: {
          spendableBalance: { $max: [0, { $subtract: [{ $ifNull: ["$spendableBalance", 0] }, wanted] }] },
          totalCoins: { $max: [0, { $subtract: [{ $ifNull: ["$totalCoins", 0] }, wanted] }] },
        },
      },
    ],
    { returnDocument: "before", updatePipeline: true }
  )
    .select("spendableBalance totalCoins")
    .lean();
  const balanceBefore = Math.max(before?.spendableBalance ?? 0, 0);
  const totalBefore = Math.max(before?.totalCoins ?? 0, 0);
  return {
    applied: Math.min(wanted, balanceBefore),
    balanceAfter: Math.max(balanceBefore - wanted, 0),
    totalAfter: Math.max(totalBefore - wanted, 0),
  };
}
