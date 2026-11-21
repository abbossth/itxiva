// Kutish zalida hazillashish: o'yinchi chap yoki o'ng qo'shnisini "itaradi". Proyektordagi tartib bilan bir xil:
// qo'shilish tartibi (jamoaviyda — o'z jamoasi qatorida). Bu fayl brauzer va server uchun umumiy.

export type PushDir = "left" | "right";

/** Ko'tarib otish animatsiyasi davomiyligi (ms) va itargandan keyin qayta itarish mumkin bo'lguncha (10 s) */
export const PUSH_MS = 4400;
export const PUSH_GAP_MS = 10_000;

/** Qo'shnilar: `order` — proyektordagi tartib (id va jamoa) */
export function lobbyNeighbors<T extends { id: string; team: number }>(order: T[], meId: string, teamMode: boolean): { left: T | null; right: T | null } {
  const row = teamMode ? order.filter((p) => p.team === order.find((x) => x.id === meId)?.team) : order;
  const i = row.findIndex((p) => p.id === meId);
  if (i < 0) return { left: null, right: null };
  return { left: row[i - 1] ?? null, right: row[i + 1] ?? null };
}
