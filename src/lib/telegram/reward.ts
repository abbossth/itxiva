import { awardCoins } from "@/lib/gamification/award";

// O'quvchi Telegram'ni ulasa bir marta coin oladi. Kalit bilan: uzib qayta ulash ikkinchi marta bermaydi.

export const TELEGRAM_LINK_REWARD = 5;
export const telegramRewardKey = (studentId: string) => `telegram-linked:${studentId}`;

/** Qaytaradi: hozir berildimi */
export async function rewardTelegramLink(studentId: string): Promise<boolean> {
  const res = await awardCoins({
    studentId,
    coin: TELEGRAM_LINK_REWARD,
    type: "bonus",
    description: "Telegram ulandi",
    idempotencyKey: telegramRewardKey(studentId),
  });
  return res.ok && res.applied;
}
