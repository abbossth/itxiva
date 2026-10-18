// Darajalar: XP bo'yicha hisoblanadi. Bu fayl brauzerda ham ishlatiladi (serverga bog'liq emas).

export interface LevelDef {
  level: number;
  name: string;
  minXp: number;
}

// Har daraja — bir so'zli unvon; emblemasi o'z materialidan (temir → mis → bronza → kumush → oltin → platina →
// zumrad → yoqut → olmos → koinot). Nomlar bazada saqlanmaydi, shuning uchun bemalol o'zgartirish mumkin
export const LEVEL_NAMES = [
  "Shogird",
  "Izlanuvchi",
  "Jangchi",
  "Ritsar",
  "Botir",
  "Sarkarda",
  "Qahramon",
  "Afsona",
  "Titan",
  "Xorazmiy",
] as const;

/** Daraja emblemasining materiali */
export const LEVEL_MATERIALS = ["Temir", "Mis", "Bronza", "Kumush", "Oltin", "Platina", "Zumrad", "Yoqut", "Olmos", "Koinot"] as const;

/** Telegram xabarlari uchun darajaning belgisi (sahifada — LevelBadge emblemasi) */
export const LEVEL_EMOJI = ["⚙️", "🟤", "🥉", "🥈", "🥇", "💠", "💚", "❤️‍🔥", "💎", "🌌"] as const;

export const DEFAULT_LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000, 2800, 3800, 5000];

/**
 * Sozlamadagi chegaralardan darajalar ro'yxati. Noto'g'ri qiymatlar (o'smaydigan, manfiy, soni boshqa)
 * bo'lsa — standart chegaralar ishlatiladi, shunda daraja hech qachon "orqaga ketmaydi".
 */
export function buildLevels(thresholds: unknown = DEFAULT_LEVEL_THRESHOLDS): LevelDef[] {
  const valid =
    Array.isArray(thresholds) &&
    thresholds.length === LEVEL_NAMES.length &&
    thresholds.every((t, i) => Number.isInteger(t) && t >= 0 && (i === 0 ? t === 0 : t > thresholds[i - 1]));
  const list = valid ? (thresholds as number[]) : DEFAULT_LEVEL_THRESHOLDS;
  return list.map((minXp, i) => ({ level: i + 1, name: LEVEL_NAMES[i], minXp }));
}

export const DEFAULT_LEVELS = buildLevels();

export function levelForXp(xp: number, levels: LevelDef[] = DEFAULT_LEVELS): LevelDef {
  let current = levels[0];
  for (const l of levels) if (xp >= l.minXp) current = l;
  return current;
}

export interface LevelProgress {
  current: LevelDef;
  next: LevelDef | null;
  xp: number;
  /** Joriy darajada to'plangan XP va daraja oralig'i */
  intoLevel: number;
  span: number;
  /** 0–100 */
  percent: number;
  /** Keyingi darajagacha qolgan XP (oxirgi darajada 0) */
  toNext: number;
}

export function levelProgress(xpRaw: number, levels: LevelDef[] = DEFAULT_LEVELS): LevelProgress {
  const xp = Math.max(0, Math.floor(Number.isFinite(xpRaw) ? xpRaw : 0));
  const current = levelForXp(xp, levels);
  const next = levels.find((l) => l.level === current.level + 1) ?? null;
  if (!next) return { current, next, xp, intoLevel: xp - current.minXp, span: 0, percent: 100, toNext: 0 };
  const span = next.minXp - current.minXp;
  const intoLevel = xp - current.minXp;
  return { current, next, xp, intoLevel, span, percent: Math.min(100, Math.round((intoLevel / span) * 100)), toNext: next.minXp - xp };
}
