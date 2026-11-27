"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { getCurrentUser, requireStudent } from "@/lib/auth/guards";
import { awardCoins } from "@/lib/gamification/award";
import { checkRateLimit } from "@/lib/rate-limit";
import { PREMIUM_DAYS, PREMIUM_PRICE, cleanStyle, daysLeft, extendPremium, isPremium, mergeStyle, type PremiumStyle } from "@/lib/premium";
import type { ActionResult } from "./auth.actions";

export interface MyPremium {
  active: boolean;
  until: string | null;
  daysLeft: number;
  style: PremiumStyle;
  balance: number;
  price: number;
}

async function load(userId: string): Promise<MyPremium | null> {
  const u = await User.findById(userId).select("premiumUntil premiumStyle spendableBalance").lean();
  if (!u) return null;
  const until = u.premiumUntil ? new Date(u.premiumUntil).toISOString() : null;
  return { active: isPremium(until), until, daysLeft: daysLeft(until), style: cleanStyle(u.premiumStyle), balance: u.spendableBalance ?? 0, price: PREMIUM_PRICE };
}

export async function getMyPremiumAction(): Promise<MyPremium | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  await connectToDatabase();
  return load(user.userId);
}

/** IT Xiva Premium: 1 oy — coin evaziga (faol bo'lsa — muddati uzayadi) */
export async function buyPremiumAction(): Promise<ActionResult<MyPremium>> {
  const session = await requireStudent();
  const rate = checkRateLimit(`premium_${session.userId}`, 5, 60_000);
  if (!rate.allowed) return { success: false, message: `Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin` };
  await connectToDatabase();
  const u = await User.findById(session.userId).select("premiumUntil").lean();
  if (!u) return { success: false, message: "Foydalanuvchi topilmadi" };
  const paid = await awardCoins({
    studentId: session.userId,
    coin: -PREMIUM_PRICE,
    xp: 0,
    type: "purchase",
    description: `IT Xiva Premium — ${PREMIUM_DAYS} kun`,
    // Ikki marta bosilsa ham bir marta yechiladi (10 soniya oynasi)
    idempotencyKey: `premium:${session.userId}:${Math.floor(Date.now() / 10_000)}`,
  });
  if (!paid.ok) return { success: false, message: paid.reason === "insufficient" ? `Balansingizda yetarli coin yo'q (${PREMIUM_PRICE} coin kerak)` : "Foydalanuvchi topilmadi" };
  await User.updateOne({ _id: session.userId }, { $set: { premiumUntil: extendPremium(u.premiumUntil) } });
  const next = await load(session.userId);
  revalidatePath("/premium");
  return next ? { success: true, data: next } : { success: false, message: "Foydalanuvchi topilmadi" };
}

/** Premium uslubi: ism shrifti, belgi va xabar rangi (faqat Premium faol bo'lsa) */
export async function setPremiumStyleAction(style: Partial<PremiumStyle>): Promise<ActionResult<MyPremium>> {
  const session = await requireStudent();
  await connectToDatabase();
  const u = await User.findById(session.userId).select("premiumUntil premiumStyle").lean();
  if (!u) return { success: false, message: "Foydalanuvchi topilmadi" };
  if (!isPremium(u.premiumUntil)) return { success: false, message: "Bu imkoniyat IT Xiva Premium uchun" };
  const next = mergeStyle(cleanStyle(u.premiumStyle), style ?? {});
  await User.updateOne({ _id: session.userId }, { $set: { premiumStyle: next } });
  const me = await load(session.userId);
  return me ? { success: true, data: me } : { success: false, message: "Foydalanuvchi topilmadi" };
}
