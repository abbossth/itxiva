"use server";

import { z } from "zod";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { TELEGRAM_LINK_REWARD, rewardTelegramLink, telegramRewardKey } from "@/lib/telegram/reward";
import { requireAuth } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { getBotUsername, isTelegramConfigured } from "@/lib/telegram/api";
import { createTelegramLinkToken, unlinkTelegram, LINK_TOKEN_TTL_MS } from "@/lib/telegram/link";
import { isNotificationType, notificationsForRole } from "@/lib/notifications/types";
import { ActionResult } from "./auth.actions";

export interface TelegramStatus {
  /** Serverda bot sozlanganmi (token va username bor) */
  available: boolean;
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  prefs: Record<string, boolean>;
  /** O'quvchi uchun: ulagani uchun bir martalik coin, olinganmi */
  reward: { amount: number; received: boolean } | null;
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const session = await requireAuth();
  await connectToDatabase();
  const user = await User.findById(session.userId).select("telegram notificationPrefs").lean();

  const prefs: Record<string, boolean> = {};
  for (const option of notificationsForRole(session.role)) {
    prefs[option.type] = user?.notificationPrefs?.[option.type] !== false;
  }

  // Avvalroq ulab qo'ygan o'quvchi ham mukofotni oladi (kalit bilan — bir marta)
  const linked = Boolean(user?.telegram?.chatId);
  let reward: TelegramStatus["reward"] = null;
  if (session.role === "student") {
    if (linked) await rewardTelegramLink(session.userId);
    const received = await CoinLedger.exists({ studentId: session.userId, idempotencyKey: telegramRewardKey(session.userId) });
    reward = { amount: TELEGRAM_LINK_REWARD, received: Boolean(received) };
  }

  return {
    available: isTelegramConfigured() && Boolean(getBotUsername()),
    linked,
    username: user?.telegram?.username ?? null,
    linkedAt: user?.telegram?.linkedAt ? new Date(user.telegram.linkedAt).toISOString() : null,
    prefs,
    reward,
  };
}

/** Bir martalik token yaratib, botga olib boradigan havolani qaytaradi */
export async function createTelegramLinkAction(): Promise<ActionResult<{ url: string; expiresInSeconds: number }>> {
  const session = await requireAuth();
  if (!isTelegramConfigured() || !getBotUsername()) {
    return { success: false, message: "Telegram bot hali sozlanmagan" };
  }
  const rate = checkRateLimit(`tg_link_${session.userId}`, 10, 10 * 60 * 1000);
  if (!rate.allowed) {
    return { success: false, message: `Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring` };
  }

  const token = await createTelegramLinkToken(session.userId);
  return {
    success: true,
    data: { url: `https://t.me/${getBotUsername()}?start=${token}`, expiresInSeconds: LINK_TOKEN_TTL_MS / 1000 },
  };
}

export async function unlinkTelegramAction(): Promise<ActionResult> {
  const session = await requireAuth();
  await unlinkTelegram(session.userId);
  return { success: true, message: "Telegram uzildi" };
}

const prefSchema = z.object({ type: z.string(), enabled: z.boolean() });

export async function setNotificationPrefAction(input: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = prefSchema.safeParse(input);
  // Faqat o'z roliga tegishli turlarni o'zgartirish mumkin
  const allowed = notificationsForRole(session.role).map((o) => o.type as string);
  if (!parsed.success || !isNotificationType(parsed.data.type) || !allowed.includes(parsed.data.type)) {
    return { success: false, message: "Noto'g'ri sozlama" };
  }

  await connectToDatabase();
  // Butun obyekt yoziladi: maydon hali yo'q yoki null bo'lgan eski hisoblarda ham ishlaydi
  const user = await User.findById(session.userId).select("notificationPrefs").lean();
  await User.updateOne(
    { _id: session.userId },
    { $set: { notificationPrefs: { ...(user?.notificationPrefs ?? {}), [parsed.data.type]: parsed.data.enabled } } }
  );
  return { success: true };
}
