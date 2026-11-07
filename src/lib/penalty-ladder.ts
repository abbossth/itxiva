import { toDateKey } from "@/lib/schedule";

// Jarima zinapoyasi: kalendar oy (Toshkent) ichida shu turdagi 1-jarima −10, 2-si −30, 3-si va keyingilari −50.
// Bu fayl brauzerda ham ishlatiladi (qoida matnlari), shuning uchun serverga bog'liq emas.

export const PENALTY_LADDER = [10, 30, 50] as const;

/** Oydagi `no`-jarima uchun olinadigan coin (musbat son) */
export function penaltyAmount(no: number): number {
  return PENALTY_LADDER[Math.min(Math.max(no, 1), PENALTY_LADDER.length) - 1];
}

/** "−10 / −30 / −50" */
export const PENALTY_LADDER_LABEL = PENALTY_LADDER.map((n) => `−${n}`).join(" / ");

/** Toshkent bo'yicha oy kaliti: "2026-11" */
export function monthKeyOf(date: Date | string | number): string {
  return toDateKey(date).slice(0, 7);
}

const UZ_MONTHS_LOCATIVE = [
  "yanvarda",
  "fevralda",
  "martda",
  "aprelda",
  "mayda",
  "iyunda",
  "iyulda",
  "avgustda",
  "sentabrda",
  "oktabrda",
  "noyabrda",
  "dekabrda",
];

/** "noyabrda 2-marta" */
export function penaltyOrdinalLabel(monthKey: string, no: number): string {
  const month = Number(monthKey.slice(5, 7));
  return `${UZ_MONTHS_LOCATIVE[month - 1] ?? "bu oyda"} ${no}-marta`;
}
