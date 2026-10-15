import { addDaysToKey, getTashkentParts, toDateKey } from "@/lib/schedule";

// Topshiriq davrlari Asia/Tashkent bo'yicha: kun "2026-10-16", hafta (dushanbadan) "2026-W42", oy "2026-10".

export function dayKey(date: Date | string | number = new Date()): string {
  return toDateKey(date);
}

/** Haftaning dushanbasi (Toshkent) — haftalik davr kaliti uchun asos */
export function weekStartKey(date: Date | string | number = new Date()): string {
  const { dateKey, weekday } = getTashkentParts(date);
  return addDaysToKey(dateKey, -(weekday - 1));
}

/** ISO hafta raqami: "2026-W42" */
export function weekKey(date: Date | string | number = new Date()): string {
  const monday = weekStartKey(date);
  // ISO: hafta payshanbasi qaysi yilga tushsa, hafta o'sha yilniki
  const thursday = addDaysToKey(monday, 3);
  const [y, m, d] = thursday.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const week = Math.floor((t - Date.UTC(y, 0, 1)) / 86_400_000 / 7) + 1;
  return `${y}-W${String(week).padStart(2, "0")}`;
}

export function monthKey(date: Date | string | number = new Date()): string {
  return toDateKey(date).slice(0, 7);
}

export type QuestRepeat = "once" | "daily" | "weekly" | "unlimited";

/**
 * Topshiriqni bir davrda bir marta bajarish uchun kalit. "unlimited" — davr yo'q (har bir yuborish alohida),
 * shuning uchun null qaytadi.
 */
export function periodKeyFor(repeat: QuestRepeat, date: Date | string | number = new Date()): string | null {
  switch (repeat) {
    case "once":
      return "once";
    case "daily":
      return `d:${dayKey(date)}`;
    case "weekly":
      return `w:${weekKey(date)}`;
    default:
      return null;
  }
}
