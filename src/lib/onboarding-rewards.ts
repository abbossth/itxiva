import { awardCoins } from "@/lib/gamification/award";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { User } from "@/lib/db/models/user.model";
import { PROFILE_COMPLETE_REWARD, profileCompleteness, profileRewardKey } from "@/lib/profile-completeness";
import { loadProfile, toOwnData } from "@/lib/student-profile-data";
import { TELEGRAM_LINK_REWARD, rewardTelegramLink, telegramRewardKey } from "@/lib/telegram/reward";
import { getBotUsername, isTelegramConfigured } from "@/lib/telegram/api";
import type { OwnProfileInput } from "@/lib/validations/student-profile.schema";

// Bir martalik mukofotlar: profilni 100% to'ldirish va Telegram'ni ulash. Topshiriqlar sahifasida
// "Bir martalik topshiriqlar" bo'lib ko'rinadi; coin kalit bilan beriladi — har biri faqat bir marta.

/**
 * Profil 100% to'ldirilgan bo'lsa o'quvchiga bir marta coin beriladi (kalit bilan — qayta saqlash yoki
 * qayta ochish ikkinchi marta bermaydi). Kim to'ldirgani muhim emas: tahrirlash yopiq bo'lsa mentor to'ldiradi.
 * Qaytaradi: hozir berildimi.
 */
export async function rewardCompleteProfile(studentId: string, data: OwnProfileInput): Promise<boolean> {
  if (!profileCompleteness(data).complete) return false;
  const res = await awardCoins({
    studentId,
    coin: PROFILE_COMPLETE_REWARD,
    type: "bonus",
    description: "Profil 100% to'ldirildi",
    idempotencyKey: profileRewardKey(studentId),
    notifyReason: "Profil 100% to'ldirildi",
  });
  return res.ok && res.applied;
}

export interface OneTimeTask {
  id: "profile" | "telegram";
  title: string;
  description: string;
  coins: number;
  done: boolean;
  progress: { current: number; target: number } | null;
  href: string;
}

/**
 * O'quvchining bir martalik topshiriqlari. Shart avvalroq bajarilgan bo'lsa (profil to'ldirilgan, Telegram ulangan),
 * mukofot shu yerda beriladi — sahifa uni "bajarildi" deb ko'rsatadi.
 */
export async function oneTimeTasks(studentId: string): Promise<OneTimeTask[]> {
  const [profile, user] = await Promise.all([loadProfile(studentId), User.findById(studentId).select("telegram").lean()]);
  const personal = toOwnData(profile);
  const completeness = profileCompleteness(personal);
  const telegramAvailable = isTelegramConfigured() && Boolean(getBotUsername());
  const linked = Boolean(user?.telegram?.chatId);

  await Promise.all([rewardCompleteProfile(studentId, personal), linked ? rewardTelegramLink(studentId) : null]);
  const received = new Set(
    (
      await CoinLedger.find({ studentId, idempotencyKey: { $in: [profileRewardKey(studentId), telegramRewardKey(studentId)] } })
        .select("idempotencyKey")
        .lean()
    ).map((r) => r.idempotencyKey)
  );

  const tasks: OneTimeTask[] = [
    {
      id: "profile",
      title: "Profilni 100% to'ldiring",
      description: "Shaxsiy ma'lumotlar, ota-ona va hujjatingiz (guvohnoma yoki pasport)",
      coins: PROFILE_COMPLETE_REWARD,
      done: received.has(profileRewardKey(studentId)),
      progress: { current: completeness.filled, target: completeness.total },
      href: "/profile?tab=settings",
    },
  ];
  // Bot sozlanmagan bo'lsa ulab bo'lmaydi — topshiriq ko'rsatilmaydi (avval olgan bo'lsa ham ko'rinadi)
  const telegramDone = received.has(telegramRewardKey(studentId));
  if (telegramAvailable || telegramDone) {
    tasks.push({
      id: "telegram",
      title: "Telegram'ni ulang",
      description: "Vazifa natijalari va yangi darslar haqida xabar Telegram'ga keladi",
      coins: TELEGRAM_LINK_REWARD,
      done: telegramDone,
      progress: null,
      href: "/profile?tab=settings#telegram",
    });
  }
  return tasks;
}
