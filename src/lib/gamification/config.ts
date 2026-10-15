import { DEFAULT_LEVEL_THRESHOLDS, buildLevels } from "./levels";

// Gamifikatsiya sozlamalari (AppSettings.gamification). Bu fayl brauzerda ham ishlatiladi.

export interface GamificationSettings {
  /** Butun funksiya shu kalit bilan yoqiladi; o'chiq bo'lsa platforma avvalgidek ishlaydi */
  enabled: boolean;
  levelThresholds: number[];
  /** Har yangi darajada beriladigan coin */
  levelUpBonus: number;
  /** Testlardan bir kunda olinadigan coin chegarasi */
  quizDailyCap: number;
  /** Test savoliga birinchi to'g'ri javob uchun coin */
  quizCoinPerQuestion: number;
  /** "Platformaga kiring" kunlik topshirig'i */
  dailyLoginCoins: number;
  /** Mentor bitta tasdiqda beradigan eng ko'p coin (inflyatsiyaga qarshi) */
  mentorBonusMax: number;
  /** Coin iqtisodiyoti: o'quvchi boshiga oylik maqsad */
  monthlyCoinTarget: number;
  /** Seriya himoyasi narxi (do'kon) */
  streakShieldPrice: number;
}

export const DEFAULT_GAMIFICATION: GamificationSettings = {
  enabled: false,
  levelThresholds: DEFAULT_LEVEL_THRESHOLDS,
  levelUpBonus: 50,
  quizDailyCap: 20,
  quizCoinPerQuestion: 1,
  dailyLoginCoins: 2,
  mentorBonusMax: 200,
  monthlyCoinTarget: 200,
  streakShieldPrice: 30,
};

const intIn = (v: unknown, min: number, max: number, fallback: number) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fallback;

/** Bazadagi (yoki formadan kelgan) qiymatni tekshiradi; noto'g'ri maydonlar standart qiymatga qaytadi */
export function parseGamification(raw: unknown): GamificationSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_GAMIFICATION;
  return {
    enabled: r.enabled === true,
    levelThresholds: buildLevels(r.levelThresholds).map((l) => l.minXp),
    levelUpBonus: intIn(r.levelUpBonus, 0, 1000, d.levelUpBonus),
    quizDailyCap: intIn(r.quizDailyCap, 0, 1000, d.quizDailyCap),
    quizCoinPerQuestion: intIn(r.quizCoinPerQuestion, 0, 100, d.quizCoinPerQuestion),
    dailyLoginCoins: intIn(r.dailyLoginCoins, 0, 100, d.dailyLoginCoins),
    mentorBonusMax: intIn(r.mentorBonusMax, 1, 10000, d.mentorBonusMax),
    monthlyCoinTarget: intIn(r.monthlyCoinTarget, 1, 100000, d.monthlyCoinTarget),
    streakShieldPrice: intIn(r.streakShieldPrice, 1, 10000, d.streakShieldPrice),
  };
}
