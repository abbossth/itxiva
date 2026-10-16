// Marralar va nishonlar katalogi: 8 ta nishon × 3 bosqich (bronza, kumush, oltin) = 24. Bu fayl brauzerda ham ishlatiladi.

export type BadgeTier = "bronze" | "silver" | "gold";
export type BadgeId = "tests" | "streak" | "attendance" | "homework" | "certificate" | "project" | "weekly" | "quests";

export interface BadgeDef {
  id: BadgeId;
  title: string;
  /** Progress yozuvi: "{n} ta to'g'ri javob" */
  unit: string;
  description: string;
  tiers: { tier: BadgeTier; threshold: number; coins: number }[];
}

export const TIER_LABEL: Record<BadgeTier, string> = { bronze: "Bronza", silver: "Kumush", gold: "Oltin" };

export const BADGES: BadgeDef[] = [
  {
    id: "tests",
    title: "Testlar ustasi",
    unit: "ta to'g'ri javob",
    description: "Testlardagi to'g'ri javoblar",
    tiers: [
      { tier: "bronze", threshold: 50, coins: 20 },
      { tier: "silver", threshold: 150, coins: 50 },
      { tier: "gold", threshold: 300, coins: 100 },
    ],
  },
  {
    id: "streak",
    title: "Kunlik seriya",
    unit: "kunlik seriya",
    description: "Eng uzun kirish seriyasi",
    tiers: [
      { tier: "bronze", threshold: 10, coins: 15 },
      { tier: "silver", threshold: 30, coins: 40 },
      { tier: "gold", threshold: 100, coins: 100 },
    ],
  },
  {
    id: "attendance",
    title: "To'liq davomat",
    unit: "oy birorta darsni qoldirmagan",
    description: "Oy davomida birorta darsni qoldirmang",
    tiers: [
      { tier: "bronze", threshold: 1, coins: 40 },
      { tier: "silver", threshold: 3, coins: 80 },
      { tier: "gold", threshold: 6, coins: 150 },
    ],
  },
  {
    id: "homework",
    title: "Vazifa ustasi",
    unit: "ta vazifa 80+ ball bilan",
    description: "Uyga vazifalar 80 va undan yuqori ball bilan",
    tiers: [
      { tier: "bronze", threshold: 10, coins: 20 },
      { tier: "silver", threshold: 30, coins: 50 },
      { tier: "gold", threshold: 60, coins: 100 },
    ],
  },
  {
    id: "certificate",
    title: "Sertifikatlar",
    unit: "ta tasdiqlangan sertifikat",
    description: "Onlayn kurs sertifikatlari",
    tiers: [
      { tier: "bronze", threshold: 1, coins: 10 },
      { tier: "silver", threshold: 3, coins: 30 },
      { tier: "gold", threshold: 10, coins: 80 },
    ],
  },
  {
    id: "project",
    title: "Portfolio egasi",
    unit: "ta qabul qilingan loyiha",
    description: "Mentor qabul qilgan loyihalar",
    tiers: [
      { tier: "bronze", threshold: 1, coins: 10 },
      { tier: "silver", threshold: 3, coins: 30 },
      { tier: "gold", threshold: 5, coins: 60 },
    ],
  },
  {
    id: "weekly",
    title: "Haftalik g'olib",
    unit: "marta 1–3-o'rin",
    description: "Haftalik masalada sovrinli o'rin",
    tiers: [
      { tier: "bronze", threshold: 1, coins: 10 },
      { tier: "silver", threshold: 3, coins: 30 },
      { tier: "gold", threshold: 10, coins: 80 },
    ],
  },
  {
    id: "quests",
    title: "Faol o'quvchi",
    unit: "ta bajarilgan topshiriq",
    description: "Mentor tasdiqlagan topshiriqlar",
    tiers: [
      { tier: "bronze", threshold: 5, coins: 10 },
      { tier: "silver", threshold: 20, coins: 30 },
      { tier: "gold", threshold: 50, coins: 80 },
    ],
  },
];

export const BADGE_COUNT = BADGES.reduce((s, b) => s + b.tiers.length, 0);

/** Keyingi bosqich (hammasi olingan bo'lsa null) */
export function nextTier(def: BadgeDef, value: number) {
  return def.tiers.find((t) => value < t.threshold) ?? null;
}
