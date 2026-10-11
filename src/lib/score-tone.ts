// Foizli ko'rsatkichlar uchun yagona rang qoidasi: past — qizil, o'rtacha — sariq, yaxshi — yashil.
// Hisobotlar, o'quvchi profili va jadvallar shu chegaralardan foydalanadi.

export type ScoreTone = "good" | "mid" | "low" | "none";

export const SCORE_GOOD = 85;
export const SCORE_MID = 60;

export function scoreTone(percent: number | null | undefined): ScoreTone {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return "none";
  if (percent >= SCORE_GOOD) return "good";
  if (percent >= SCORE_MID) return "mid";
  return "low";
}

export const SCORE_TONE: Record<ScoreTone, { label: string; text: string; bar: string; soft: string; dot: string }> = {
  good: {
    label: "Yaxshi",
    text: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
    soft: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  mid: {
    label: "O'rtacha",
    text: "text-amber-700 dark:text-amber-400",
    bar: "bg-amber-500",
    soft: "bg-amber-500/20 text-amber-900 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  low: {
    label: "Past",
    text: "text-rose-700 dark:text-rose-400",
    bar: "bg-rose-500",
    soft: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  none: {
    label: "Ma'lumot yo'q",
    text: "text-slate-500 dark:text-slate-400",
    bar: "bg-slate-300 dark:bg-slate-600",
    soft: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
    dot: "bg-slate-300 dark:bg-slate-600",
  },
};

export const formatPercent = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v}%`);
