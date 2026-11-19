"use server";

import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { requireStudent } from "@/lib/auth/guards";
import { awardCoins } from "@/lib/gamification/award";
import { checkRateLimit } from "@/lib/rate-limit";
import { boosterOf, type BoosterId } from "@/lib/live-game/boosters";
import type { ActionResult } from "./auth.actions";

// O'yin kuchaytirgichlari: zaxirani ko'rish va coin evaziga sotib olish (o'yinda ishlatish — live-game.actions).

export interface MyBoosters {
  counts: Record<BoosterId, number>;
  balance: number;
}

const countsOf = (b: { fifty?: number; double?: number; guard?: number } | null | undefined): Record<BoosterId, number> => ({
  fifty: Math.max(0, b?.fifty ?? 0),
  double: Math.max(0, b?.double ?? 0),
  guard: Math.max(0, b?.guard ?? 0),
});

export async function getMyBoostersAction(): Promise<MyBoosters | null> {
  const session = await requireStudent();
  await connectToDatabase();
  const u = await User.findById(session.userId).select("boosters spendableBalance").lean();
  return u ? { counts: countsOf(u.boosters), balance: u.spendableBalance ?? 0 } : null;
}

/**
 * Sotib olish. `nonce` — bitta bosish uchun tasodifiy kalit: ikki marta bosilsa yoki so'rov qaytarilsa ham coin bir marta yechiladi.
 */
export async function buyBoosterAction(id: string, qty: number, nonce: string): Promise<ActionResult<MyBoosters>> {
  const session = await requireStudent();
  const b = boosterOf(id);
  if (!b) return { success: false, message: "Bunday kuchaytirgich yo'q" };
  const n = Math.max(1, Math.min(5, Math.floor(Number(qty) || 1)));
  if (typeof nonce !== "string" || nonce.length < 6 || nonce.length > 64) return { success: false, message: "Qayta urinib ko'ring" };
  const rate = checkRateLimit(`boost_${session.userId}`, 20, 60_000);
  if (!rate.allowed) return { success: false, message: `Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring` };
  await connectToDatabase();
  const paid = await awardCoins({
    studentId: session.userId,
    coin: -b.price * n,
    xp: 0,
    type: "purchase",
    description: `O'yin kuchaytirgichi: ${b.name} ×${n}`,
    idempotencyKey: `boost:${session.userId}:${nonce}`,
  });
  if (!paid.ok) return { success: false, message: paid.reason === "insufficient" ? "Balansingizda yetarli coin yo'q" : "Foydalanuvchi topilmadi" };
  if (paid.applied) {
    await User.updateOne({ _id: session.userId, boosters: null }, { $set: { boosters: { fifty: 0, double: 0, guard: 0 } } });
    await User.updateOne({ _id: session.userId }, { $inc: { [`boosters.${b.id}`]: n } });
  }
  const u = await User.findById(session.userId).select("boosters spendableBalance").lean();
  return { success: true, data: { counts: countsOf(u?.boosters), balance: u?.spendableBalance ?? 0 } };
}
