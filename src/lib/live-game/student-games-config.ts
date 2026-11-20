// O'quvchilar yaratadigan jonli o'yinlar: mentor sozlamalari va narxlar. Bu fayl brauzer va server uchun umumiy.
// O'quvchi o'z guruhi yoki butun sinfi (masalan, barcha 8-sinflar) uchun o'yin ochadi. O'yin narxi qatnashchilar
// birgalikda coin qo'shib yig'iladi (masalan, klassik 15 coin: biri 5, biri 2, biri 4...), narx to'lgach o'yin boshlanadi.
// G'oliblarga coin beriladi (sukutda 30/20/10, jamoaviyda g'olib jamoa a'zolariga 20) — kamida 3 o'yinchi bo'lsa;
// sovg'a qutilari va test savollari uchun coin berilmaydi. O'yinni server o'zi boshqaradi (proyektor shart emas).

import { LIVE_GAME_MODES, type LiveGameMode } from "./mode-list";

export interface StudentGamesSettings {
  /** O'quvchilar o'yin yarata oladimi */
  enabled: boolean;
  /** Dars vaqtida (o'z guruhining jadvali bo'yicha yoki davomat ochiq bo'lsa) yaratib bo'lmaydi */
  blockDuringLessons: boolean;
  /** Butun sinf uchun o'yin ruxsat etilganmi */
  allowGrade: boolean;
  /** Butun sinf uchun qo'shimcha narx (coin) */
  gradeExtra: number;
  /** Bir o'quvchi kuniga nechta o'yin yarata oladi */
  dailyLimit: number;
  /** O'yin turlari narxi (coin); 0 yoki yo'q — bu tur o'quvchilarga yopiq */
  prices: Record<LiveGameMode, number>;
  /** Darsni sababsiz qoldirgan o'quvchiga shuncha kun jonli o'yin yopiq (0 — cheklov yo'q) */
  absenceBanDays: number;
  /** Cheklov mentor o'yinlariga ham tegishli (aks holda faqat o'quvchilar o'yiniga) */
  absenceBanAllGames: boolean;
  /** G'oliblarga coin: 1-, 2-, 3-o'rin */
  prizes: [number, number, number];
  /** Jamoaviy o'yinda g'olib jamoaning har bir a'zosiga */
  teamPrize: number;
  /** Sovrin shuncha o'yinchi qatnashganda beriladi (o'zi yolg'iz o'ynab coin "ishlab topmasin") */
  minPlayersForPrizes: number;
  /** Skidka: har bir o'yin turi shuncha coin arzon (0 — skidka yo'q) */
  discount: number;
  /** Bepul davr (ISO vaqt): shu oraliqda o'yin ochish bepul — coin yig'ilmaydi, egasi o'zi boshlaydi */
  freeFrom: string | null;
  freeUntil: string | null;
  /** Bepul o'yinlarda ham g'oliblarga coin berilsinmi (sukutda yo'q — bepul o'ynab coin "ishlab topilmasin") */
  freePrizes: boolean;
}

/** O'yin turlari bo'yicha boshlang'ich narxlar (birgalikda yig'iladi): 10 coindan, real vaqtli janglar qimmatroq */
export const DEFAULT_STUDENT_GAME_PRICES: Record<LiveGameMode, number> = {
  classic: 15,
  survival: 20,
  team: 20,
  chest: 25,
  race: 25,
  territory: 25,
  rocket: 25,
  bridge: 25,
  gold: 25,
  zone: 30,
  galaxy: 30,
  arena: 40,
};

export const MIN_STUDENT_GAME_PRICE = 10;
export const MAX_STUDENT_GAME_PRICE = 2000;

export const DEFAULT_STUDENT_GAMES: StudentGamesSettings = {
  enabled: true,
  blockDuringLessons: true,
  allowGrade: true,
  gradeExtra: 10,
  dailyLimit: 3,
  prices: DEFAULT_STUDENT_GAME_PRICES,
  absenceBanDays: 2,
  absenceBanAllGames: true,
  prizes: [30, 20, 10],
  teamPrize: 20,
  minPlayersForPrizes: 3,
  discount: 5,
  freeFrom: null,
  freeUntil: null,
  freePrizes: false,
};

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Bazadagi (yoki formadan kelgan) qiymatni tekshirib o'qish */
export function parseStudentGames(raw: unknown): StudentGamesSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rp = (r.prices && typeof r.prices === "object" ? r.prices : {}) as Record<string, unknown>;
  const prices = {} as Record<LiveGameMode, number>;
  for (const m of LIVE_GAME_MODES) {
    const v = rp[m];
    // 0 — tur yopiq; aks holda 10 coindan kam bo'lmaydi
    prices[m] = v === 0 || v === "0" ? 0 : int(v, MIN_STUDENT_GAME_PRICE, MAX_STUDENT_GAME_PRICE, DEFAULT_STUDENT_GAME_PRICES[m]);
  }
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_STUDENT_GAMES.enabled,
    blockDuringLessons: typeof r.blockDuringLessons === "boolean" ? r.blockDuringLessons : DEFAULT_STUDENT_GAMES.blockDuringLessons,
    allowGrade: typeof r.allowGrade === "boolean" ? r.allowGrade : DEFAULT_STUDENT_GAMES.allowGrade,
    gradeExtra: int(r.gradeExtra, 0, 1000, DEFAULT_STUDENT_GAMES.gradeExtra),
    dailyLimit: int(r.dailyLimit, 1, 20, DEFAULT_STUDENT_GAMES.dailyLimit),
    prices,
    absenceBanDays: int(r.absenceBanDays, 0, 14, DEFAULT_STUDENT_GAMES.absenceBanDays),
    absenceBanAllGames: typeof r.absenceBanAllGames === "boolean" ? r.absenceBanAllGames : DEFAULT_STUDENT_GAMES.absenceBanAllGames,
    prizes: [0, 1, 2].map((i) => int(Array.isArray(r.prizes) ? r.prizes[i] : undefined, 0, 500, DEFAULT_STUDENT_GAMES.prizes[i])) as [number, number, number],
    teamPrize: int(r.teamPrize, 0, 500, DEFAULT_STUDENT_GAMES.teamPrize),
    minPlayersForPrizes: int(r.minPlayersForPrizes, 1, 50, DEFAULT_STUDENT_GAMES.minPlayersForPrizes),
    discount: int(r.discount, 0, 500, DEFAULT_STUDENT_GAMES.discount),
    freeFrom: isoOrNull(r.freeFrom),
    freeUntil: isoOrNull(r.freeUntil),
    freePrizes: typeof r.freePrizes === "boolean" ? r.freePrizes : DEFAULT_STUDENT_GAMES.freePrizes,
  };
}

const isoOrNull = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

export type StudentGameAudience = "group" | "grade";

/** Hozir bepul davrmi */
export function isFreeNow(s: StudentGamesSettings, now: number = Date.now()): boolean {
  if (!s.freeUntil) return false;
  const from = s.freeFrom ? Date.parse(s.freeFrom) : -Infinity;
  return now >= from && now < Date.parse(s.freeUntil);
}

/** Skidkadan keyin ham narx shundan kam bo'lmaydi */
export const MIN_DISCOUNTED_PRICE = 5;

/** O'yin narxi: to'liq narx, skidka bilan narx va bepulmi; tur yopiq bo'lsa null */
export function studentGameCost(
  s: StudentGamesSettings,
  mode: LiveGameMode,
  audience: StudentGameAudience,
  now: number = Date.now()
): { full: number; price: number; free: boolean } | null {
  const base = s.prices[mode];
  if (!base) return null;
  if (audience === "grade" && !s.allowGrade) return null;
  const full = base + (audience === "grade" ? s.gradeExtra : 0);
  if (isFreeNow(s, now)) return { full, price: 0, free: true };
  return { full, price: Math.max(MIN_DISCOUNTED_PRICE, full - s.discount), free: false };
}

/** Yig'iladigan narx (skidka va bepul davr hisobga olingan); tur yopiq bo'lsa null */
export function studentGamePrice(s: StudentGamesSettings, mode: LiveGameMode, audience: StudentGameAudience, now: number = Date.now()): number | null {
  return studentGameCost(s, mode, audience, now)?.price ?? null;
}

/** O'yin hujjatiga yoziladigan sovrinlar: jamoaviyda faqat birinchisi (g'olib jamoa a'zolariga) */
export function studentGamePrizes(s: StudentGamesSettings, mode: LiveGameMode): number[] {
  return mode === "team" ? [s.teamPrize, 0, 0] : [...s.prizes];
}

/** Savollar soni tanlovi */
export const STUDENT_GAME_COUNTS = [5, 10, 15] as const;
/** Natija ko'rsatilgach keyingi bosqichgacha (s); sandiq rejimida sandiq ochishga ko'proq vaqt */
export const AUTO_REVEAL_S = 10;
export const AUTO_REVEAL_CHEST_S = 14;
/** Tugagan qisqa o'yin natijasi (s) */
export const AUTO_MINIGAME_S = 6;
/** Coin yig'ilmagan / boshlanmagan o'yin shuncha vaqtdan keyin bekor qilinadi (har kimga o'z coini qaytariladi) */
export const STUDENT_LOBBY_MAX_MS = 20 * 60 * 1000;
/** Narx to'lgach o'yin boshlanishigacha (s): kechikkanlar qo'shilib ulguradi */
export const FUNDED_START_S = 8;
/** Bitta hissa: 1 coindan (tez tugmalar) */
export const CONTRIBUTION_STEPS = [1, 2, 5, 10] as const;
