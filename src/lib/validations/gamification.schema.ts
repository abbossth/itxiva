import { z } from "zod";
import { LEVEL_NAMES } from "@/lib/gamification/levels";

const int = (min: number, max: number, label: string) =>
  z.number({ error: `${label}: son kiriting` }).int(`${label}: butun son bo'lsin`).min(min, `${label}: kamida ${min}`).max(max, `${label}: ko'pi bilan ${max}`);

export const gamificationSettingsSchema = z.object({
  enabled: z.boolean(),
  levelThresholds: z
    .array(int(0, 1_000_000, "Daraja chegarasi"))
    .length(LEVEL_NAMES.length, `${LEVEL_NAMES.length} ta daraja chegarasi bo'lishi kerak`)
    .refine((t) => t[0] === 0, "1-daraja 0 XP dan boshlanadi")
    .refine((t) => t.every((v, i) => i === 0 || v > t[i - 1]), "Har bir daraja chegarasi oldingisidan katta bo'lsin"),
  levelUpBonus: int(0, 1000, "Daraja bonusi"),
  quizDailyCap: int(0, 1000, "Testdan kunlik chegara"),
  quizCoinPerQuestion: int(0, 100, "Test savoli uchun coin"),
  dailyLoginCoins: int(0, 100, "Kunlik kirish coini"),
  mentorBonusMax: int(1, 10000, "Mentor bonusining maksimumi"),
  monthlyCoinTarget: int(1, 100000, "Oylik maqsad"),
  streakShieldPrice: int(1, 10000, "Seriya himoyasi narxi"),
});
