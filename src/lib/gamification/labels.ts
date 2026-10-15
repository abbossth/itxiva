import type { QuestAutoKind, QuestDifficulty, QuestTemplate, QuestVerify } from "@/lib/db/models/quest.model";
import type { QuestRepeat } from "./periods";

// Topshiriq yorliqlari va shablonlari. Bu fayl brauzerda ham ishlatiladi.

export const VERIFY_LABEL: Record<QuestVerify, string> = {
  auto: "Avtomatik",
  mentor: "Mentor tekshiradi",
  proof: "Dalil bilan",
  competition: "Musobaqa",
};

export const VERIFY_HINT: Record<QuestVerify, string> = {
  auto: "Tizim o'zi hisoblaydi: testlar soni, seriya, davomat",
  mentor: "O'quvchi ish yuboradi, siz baholaysiz",
  proof: "Sertifikat, natija yoki hujjat — siz tasdiqlaysiz",
  competition: "Haftalik masala: birinchi 3 ta to'g'ri yechim o'rin oladi",
};

/** Turi belgisining rangi */
export const VERIFY_TONE: Record<QuestVerify, string> = {
  auto: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  mentor: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  proof: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  competition: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
};

export const DIFFICULTY_LABEL: Record<QuestDifficulty, string> = { easy: "Oson", medium: "O'rta", hard: "Qiyin" };

export const REPEAT_LABEL: Record<QuestRepeat, string> = {
  once: "Bir martalik",
  daily: "Har kuni",
  weekly: "Har hafta",
  unlimited: "Cheksiz",
};

export const AUTO_KIND_LABEL: Record<QuestAutoKind, string> = {
  tests_today: "Bugun N ta test savoliga javob",
  materials: "N ta dars materialini ochish",
  login: "Platformaga kirish",
  login_streak: "N kunlik kirish seriyasi",
  month_attendance: "Oy davomida to'liq davomat",
  group_challenge: "Guruh oylik davomati N% dan yuqori",
};

/** Shartda N (maqsad) kerakmi */
export const AUTO_KIND_HAS_TARGET: Record<QuestAutoKind, boolean> = {
  tests_today: true,
  materials: true,
  login: false,
  login_streak: true,
  month_attendance: false,
  group_challenge: true,
};

export function rewardLabel(r: { coinsMin: number; coinsMax: number; xp: number | null; places: number[] }, verify: QuestVerify): string {
  if (verify === "competition" && r.places.length) return `+${r.places.join("/")}`;
  if (r.coinsMin !== r.coinsMax) return `+${r.coinsMin}–${r.coinsMax}`;
  return `+${r.coinsMin}`;
}

export interface QuestTemplateDef {
  id: QuestTemplate;
  title: string;
  hint: string;
  /** Formaga qo'yiladigan boshlang'ich qiymatlar */
  preset: {
    title: string;
    description: string;
    difficulty: QuestDifficulty;
    verify: QuestVerify;
    autoRule: { kind: QuestAutoKind; target: number } | null;
    evidence: { link: "required" | "optional" | "none"; file: boolean; certId: boolean; note: boolean };
    guard: { uniqueProof: boolean; dateAfterJoin: boolean; monthlyLimit: number | null };
    reward: { coinsMin: number; coinsMax: number; xp: number | null; places: number[] };
    repeat: QuestRepeat;
  };
}

export const QUEST_TEMPLATES: QuestTemplateDef[] = [
  {
    id: "certificate",
    title: "Kurs sertifikati",
    hint: "Havola, fayl va izoh bilan",
    preset: {
      title: "Onlayn kurs sertifikati",
      description: "Coursera, freeCodeCamp va boshqa platformalardagi kurs sertifikati. Haqiqiyligi tekshiriladi.",
      difficulty: "medium",
      verify: "proof",
      autoRule: null,
      evidence: { link: "required", file: true, certId: true, note: true },
      guard: { uniqueProof: true, dateAfterJoin: true, monthlyLimit: 3 },
      reward: { coinsMin: 60, coinsMax: 150, xp: null, places: [] },
      repeat: "unlimited",
    },
  },
  {
    id: "project",
    title: "Loyiha topshirish",
    hint: "GitHub yoki sayt havolasi",
    preset: {
      title: "Portfolio saytingizni internetga joylang",
      description: "GitHub Pages yoki Vercel'ga joylab, havolasini yuboring.",
      difficulty: "medium",
      verify: "mentor",
      autoRule: null,
      evidence: { link: "required", file: false, certId: false, note: true },
      guard: { uniqueProof: true, dateAfterJoin: false, monthlyLimit: null },
      reward: { coinsMin: 80, coinsMax: 80, xp: null, places: [] },
      repeat: "once",
    },
  },
  {
    id: "habit",
    title: "Kunlik odat",
    hint: "Kirish, test yoki o'qish seriyasi",
    preset: {
      title: "7 kun ketma-ket kiring",
      description: "Bir hafta davomida har kuni platformaga kiring.",
      difficulty: "easy",
      verify: "auto",
      autoRule: { kind: "login_streak", target: 7 },
      evidence: { link: "none", file: false, certId: false, note: false },
      guard: { uniqueProof: false, dateAfterJoin: false, monthlyLimit: null },
      reward: { coinsMin: 15, coinsMax: 15, xp: null, places: [] },
      repeat: "weekly",
    },
  },
  {
    id: "group_challenge",
    title: "Guruh chellenji",
    hint: "Guruhlar o'rtasida musobaqa",
    preset: {
      title: "Oylik davomat chellenji",
      description: "Guruh oy davomida 90% davomatga yetsa, har bir a'zo bonus oladi.",
      difficulty: "medium",
      verify: "auto",
      autoRule: { kind: "group_challenge", target: 90 },
      evidence: { link: "none", file: false, certId: false, note: false },
      guard: { uniqueProof: false, dateAfterJoin: false, monthlyLimit: null },
      reward: { coinsMin: 25, coinsMax: 25, xp: null, places: [] },
      repeat: "unlimited",
    },
  },
];
