// Imtihon nazorati: to'liq ekran rejimi va ogohlantirishlar. Server ham, o'quvchi ekrani ham shu qoidalarga tayanadi.

/** Shuncha ogohlantirishdan keyin urinish yopiladi va 0 ball qo'yiladi */
export const MAX_EXAM_VIOLATIONS = 3;

export const VIOLATION_LABELS = {
  fullscreen_exit: "To'liq ekrandan chiqdi",
  tab_hidden: "Boshqa oyna yoki ilovaga o'tdi",
  unlocked: "Mentor blokdan ochdi",
} as const;

/**
 * Mentor blokdan ochganda: o'quvchi yopilgan paytda qancha vaqti qolgan bo'lsa, shuncha vaqt qaytariladi.
 * Boshlangan vaqt blokda o'tgan vaqtga suriladi.
 */
export function shiftedStartForUnlock(startedAt: Date | string, lockedAt: Date | string | null | undefined, now: Date): Date {
  const started = new Date(startedAt).getTime();
  if (!lockedAt) return new Date(started);
  const paused = Math.max(0, now.getTime() - new Date(lockedAt).getTime());
  return new Date(started + paused);
}
