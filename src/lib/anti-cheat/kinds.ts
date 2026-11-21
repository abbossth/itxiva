// Anti-cheat: qayd etiladigan qoidabuzarlik turlari (mijoz va server uchun umumiy, "use server" emas)

export const CHEAT_KINDS = ["leave", "copy", "paste", "screenshot", "devtools", "print", "fast"] as const;
export type CheatKind = (typeof CHEAT_KINDS)[number];
export type CheatContext = "quiz" | "exam" | "live";
export type CheatCounts = Partial<Record<CheatKind, number>>;

export const CHEAT_LABELS: Record<CheatKind, string> = {
  leave: "boshqa oyna/ilovaga o'tdi",
  copy: "nusxalashga urindi",
  paste: "matn qo'yishga urindi",
  screenshot: "screenshot olishga urindi",
  devtools: "dasturchi vositalarini ochishga urindi",
  print: "chop etishga urindi",
  fast: "inson ulgurmaydigan tezlikda javob berdi",
};

/** Javob savol chiqqanidan shuncha ms ichida kelsa — bot/skript deb hisoblanadi (tezlik bali berilmaydi) */
export const MIN_HUMAN_ANSWER_MS = 600;

export function cheatTotal(c: CheatCounts | null | undefined): number {
  if (!c) return 0;
  return CHEAT_KINDS.reduce((n, k) => n + (c[k] ?? 0), 0);
}

/** Mentor uchun qisqa izoh: "3 marta boshqa oyna/ilovaga o'tdi, 1 marta screenshot olishga urindi" */
export function describeCheats(c: CheatCounts | null | undefined): string {
  if (!c) return "";
  return CHEAT_KINDS.filter((k) => (c[k] ?? 0) > 0)
    .map((k) => `${c[k]} marta ${CHEAT_LABELS[k]}`)
    .join(", ");
}
