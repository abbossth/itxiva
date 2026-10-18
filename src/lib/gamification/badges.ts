// Marralar va nishonlar katalogi: 8 ta nishon × 3 bosqich (bronza, kumush, oltin) = 24. Bu fayl brauzerda ham ishlatiladi.

export type BadgeTier = "bronze" | "silver" | "gold";
export type BadgeId = "tests" | "streak" | "attendance" | "homework" | "certificate" | "project" | "weekly" | "quests";

export interface BadgeDef {
  id: BadgeId;
  title: string;
  /** Progress yozuvi: "{n} ta to'g'ri javob" */
  unit: string;
  description: string;
  /** Bosqich unvonlari: bronza → kumush → oltin (kuchayib boradi) */
  tierNames: Record<BadgeTier, string>;
  tiers: { tier: BadgeTier; threshold: number; coins: number }[];
}

export const TIER_LABEL: Record<BadgeTier, string> = { bronze: "Bronza", silver: "Kumush", gold: "Oltin" };

export const BADGES: BadgeDef[] = [
  {
    id: "tests",
    title: "Aql Jangchisi",
    unit: "ta to'g'ri javob",
    description: "Testlardagi to'g'ri javoblar",
    tierNames: { bronze: "Askar", silver: "Qo'mondon", gold: "Sarkarda" },
    tiers: [
      { tier: "bronze", threshold: 50, coins: 20 },
      { tier: "silver", threshold: 150, coins: 50 },
      { tier: "gold", threshold: 300, coins: 100 },
    ],
  },
  {
    id: "streak",
    title: "To'xtamas Lashkar",
    unit: "kunlik seriya",
    description: "Eng uzun kirish seriyasi",
    tierNames: { bronze: "Sabotli", silver: "Temir Lashkar", gold: "Mag'lubiyatsiz" },
    tiers: [
      { tier: "bronze", threshold: 10, coins: 15 },
      { tier: "silver", threshold: 30, coins: 40 },
      { tier: "gold", threshold: 100, coins: 100 },
    ],
  },
  {
    id: "attendance",
    title: "Qal'a Himoyachisi",
    unit: "oy birorta darsni qoldirmagan",
    description: "Oy davomida birorta darsni qoldirmang",
    tierNames: { bronze: "Qorovul", silver: "Qal'a Posboni", gold: "Qal'a Sarkardasi" },
    tiers: [
      { tier: "bronze", threshold: 1, coins: 40 },
      { tier: "silver", threshold: 3, coins: 80 },
      { tier: "gold", threshold: 6, coins: 150 },
    ],
  },
  {
    id: "homework",
    title: "Arena Gladiatori",
    unit: "ta vazifa 80+ ball bilan",
    description: "Uyga vazifalar 80 va undan yuqori ball bilan",
    tierNames: { bronze: "Gladiator", silver: "Arena Chempioni", gold: "Arena Imperatori" },
    tiers: [
      { tier: "bronze", threshold: 10, coins: 20 },
      { tier: "silver", threshold: 30, coins: 50 },
      { tier: "gold", threshold: 60, coins: 100 },
    ],
  },
  {
    id: "certificate",
    title: "Bilim Fotihi",
    unit: "ta tasdiqlangan sertifikat",
    description: "Onlayn kurs sertifikatlari",
    tierNames: { bronze: "Fotih", silver: "Buyuk Fotih", gold: "Jahongir" },
    tiers: [
      { tier: "bronze", threshold: 1, coins: 10 },
      { tier: "silver", threshold: 3, coins: 30 },
      { tier: "gold", threshold: 10, coins: 80 },
    ],
  },
  {
    id: "project",
    title: "Imperiya Bunyodkori",
    unit: "ta qabul qilingan loyiha",
    description: "Mentor qabul qilgan loyihalar",
    tierNames: { bronze: "Bunyodkor", silver: "Qal'a Me'mori", gold: "Imperiya Asoschisi" },
    tiers: [
      { tier: "bronze", threshold: 1, coins: 10 },
      { tier: "silver", threshold: 3, coins: 30 },
      { tier: "gold", threshold: 5, coins: 60 },
    ],
  },
  {
    id: "weekly",
    title: "Turnir G'olibi",
    unit: "marta 1–3-o'rin",
    description: "Haftalik masalada sovrinli o'rin",
    tierNames: { bronze: "Ritsar", silver: "Chempion", gold: "Afsona" },
    tiers: [
      { tier: "bronze", threshold: 1, coins: 10 },
      { tier: "silver", threshold: 3, coins: 30 },
      { tier: "gold", threshold: 10, coins: 80 },
    ],
  },
  {
    id: "quests",
    title: "Yurish Qahramoni",
    unit: "ta bajarilgan topshiriq",
    description: "Mentor tasdiqlagan topshiriqlar",
    tierNames: { bronze: "Botir", silver: "Pahlavon", gold: "Alpomish" },
    tiers: [
      { tier: "bronze", threshold: 5, coins: 10 },
      { tier: "silver", threshold: 20, coins: 30 },
      { tier: "gold", threshold: 50, coins: 80 },
    ],
  },
];

export const BADGE_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b])) as Record<BadgeId, BadgeDef>;

/** "Aql Jangchisi · Askar" */
export function badgeTierTitle(id: BadgeId, tier: BadgeTier): string {
  const def = BADGE_BY_ID[id];
  return def ? `${def.title} · ${def.tierNames[tier]}` : TIER_LABEL[tier];
}

export const BADGE_COUNT = BADGES.reduce((s, b) => s + b.tiers.length, 0);

/** Keyingi bosqich (hammasi olingan bo'lsa null) */
export function nextTier(def: BadgeDef, value: number) {
  return def.tiers.find((t) => value < t.threshold) ?? null;
}
