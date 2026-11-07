// Test o'yin rejimining qoidalari: savolga vaqt, ochko va reyting bonusi.
// Bu fayl brauzerda ham ishlatiladi (muharrir, o'yin ekrani), shuning uchun serverga bog'liq emas.

/** Mentor tanlashi mumkin bo'lgan vaqtlar (soniya) */
export const QUIZ_TIME_LIMITS = [10, 20, 30, 60, 90, 120];

/** Javob yuborilishidagi tarmoq kechikishi uchun qo'shimcha vaqt */
export const QUIZ_TIME_GRACE_MS = 2000;

/** Savolning vaqti: mentor belgilagan yoki sukutdagi (ochiq savolga ko'proq) */
export function questionTimeLimit(q: { type: string; timeLimit?: number | null }): number {
  if (typeof q.timeLimit === "number" && QUIZ_TIME_LIMITS.includes(q.timeLimit)) return q.timeLimit;
  return q.type === "open_ended" ? 90 : 20;
}

export const MAX_STREAK_BONUS = 500;

/**
 * To'g'ri javob ochkosi: tezlikka qarab 500–1000 va ketma-ketlik bonusi (2-to'g'ridan +100, +200 ... ko'pi bilan +500).
 * Xato javobda 0. `streak` — shu javob bilan birga ketma-ket to'g'ri javoblar soni.
 */
export function answerPoints({
  isCorrect,
  elapsedMs,
  limitSec,
  streak,
}: {
  isCorrect: boolean;
  elapsedMs: number;
  limitSec: number;
  streak: number;
}): { base: number; bonus: number; total: number } {
  if (!isCorrect) return { base: 0, bonus: 0, total: 0 };
  const ratio = Math.min(Math.max(elapsedMs / (limitSec * 1000), 0), 1);
  const base = Math.round(1000 * (1 - 0.5 * ratio));
  const bonus = Math.min(Math.max(streak - 1, 0) * 100, MAX_STREAK_BONUS);
  return { base, bonus, total: base + bonus };
}

/** Guruh reytingidagi 1-, 2-, 3-o'rin uchun bonus coin */
export const QUIZ_PLACE_COINS = [15, 10, 5];

/** Reyting dars sanasidan shuncha kun o'tib yakunlanadi (bonus shunda beriladi) */
export const QUIZ_LEADERBOARD_DAYS = 7;
