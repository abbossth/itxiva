import { addDaysToKey } from "@/lib/schedule";

// Kirish seriyasi: ketma-ket kirilgan kunlar (Asia/Tashkent). Sof funksiya — test qilish oson.

export interface StreakState {
  current: number;
  best: number;
  lastDayKey: string | null;
}

export interface StreakStep {
  next: StreakState;
  /** Himoya ishlatildimi (bir kun o'tkazib yuborilgan edi) */
  usedShield: boolean;
  /** Bugun allaqachon hisoblangan — o'zgarish yo'q */
  unchanged: boolean;
}

/**
 * Bugungi kirishdan keyingi seriya.
 * Kecha kirgan bo'lsa +1; bitta kun o'tkazib yuborilgan va himoya bor bo'lsa — himoya o'sha kunni yopadi va seriya davom etadi;
 * aks holda seriya 1 dan boshlanadi.
 */
export function stepStreak(prev: StreakState | null | undefined, today: string, shields: number): StreakStep {
  const p: StreakState = { current: prev?.current ?? 0, best: prev?.best ?? 0, lastDayKey: prev?.lastDayKey ?? null };
  if (p.lastDayKey === today) return { next: p, usedShield: false, unchanged: true };

  let current = 1;
  let usedShield = false;
  if (p.lastDayKey && p.lastDayKey === addDaysToKey(today, -1)) {
    current = p.current + 1;
  } else if (p.lastDayKey && p.lastDayKey === addDaysToKey(today, -2) && shields > 0) {
    current = p.current + 1;
    usedShield = true;
  }
  return { next: { current, best: Math.max(p.best, current), lastDayKey: today }, usedShield, unchanged: false };
}

/**
 * Ko'rsatish uchun seriya: o'quvchi bugun hali kirmagan bo'lsa ham, kecha kirgan (yoki himoya yopadigan bitta kun
 * o'tkazilgan) bo'lsa seriya saqlanadi; aks holda allaqachon uzilgan — 0.
 */
export function effectiveStreak(prev: StreakState | null | undefined, today: string, shields: number): number {
  if (!prev?.lastDayKey) return 0;
  if (prev.lastDayKey === today || prev.lastDayKey === addDaysToKey(today, -1)) return prev.current;
  if (prev.lastDayKey === addDaysToKey(today, -2) && shields > 0) return prev.current;
  return 0;
}
