// Savollar orasidagi qisqa o'yinlar: navbat, vaqt, ochko va omad g'ildiragi — sof funksiyalar.
// Bu fayl brauzerda ham ishlatiladi (ekranlar), shuning uchun serverga bog'liq emas.

export type MinigameKind = "tap" | "target" | "wheel" | "bonus";
export const MINIGAME_KINDS: MinigameKind[] = ["tap", "target", "wheel", "bonus"];

export const MINIGAMES: Record<MinigameKind, { title: string; rule: string; seconds: number }> = {
  tap: { title: "Tezkor bosish", rule: "10 soniyada tugmani iloji boricha ko'p bosing!", seconds: 10 },
  target: { title: "Mo'ljalga otish", rule: "Chiqib turgan nishonlarni tez-tez uring!", seconds: 15 },
  wheel: { title: "Omad g'ildiragi", rule: "G'ildirak kimgadir sovg'a tanlaydi…", seconds: 7 },
  bonus: { title: "Bonus raund", rule: "Keyingi savol ikki baravar ochko beradi!", seconds: 5 },
};

/** O'yin boshlanishidan oldingi sanoq (soniya) */
export const MINIGAME_INTRO_S = 3;
/** Natija yuborilishidagi kechikish uchun qo'shimcha vaqt */
export const MINIGAME_GRACE_MS = 3000;
/** Har nechta savoldan keyin */
export const MINIGAME_EVERY = 3;

/** Bu natijadan keyin qisqa o'yin navbatimi (oxirgi savoldan keyin emas, har round bir marta) */
export function minigameDue(index: number, total: number, playedRounds: number[]): boolean {
  return (index + 1) % MINIGAME_EVERY === 0 && index + 1 < total && !playedRounds.includes(index);
}

/** Tasodifiy tur: oldingisi takrorlanmaydi */
export function pickMinigame(previous: MinigameKind | null, rng: number = Math.random()): MinigameKind {
  const pool = MINIGAME_KINDS.filter((k) => k !== previous);
  return pool[Math.min(pool.length - 1, Math.floor(rng * pool.length))];
}

/** Bir o'yinchi uchun eng ko'p hisoblanadigan natija (soxta katta son yuborilsa ham) */
export const MINIGAME_CAP: Record<"tap" | "target", number> = { tap: 150, target: 40 };

export function clampMinigameValue(kind: MinigameKind, value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return kind === "tap" || kind === "target" ? Math.min(n, MINIGAME_CAP[kind]) : 0;
}

/**
 * Ochko: tezkor bosish — har bosish 5 (ko'pi bilan 120 bosish hisobga olinadi), eng tezga +200;
 * mo'ljal — har nishon 40 (ko'pi bilan 30).
 */
export function minigamePoints(kind: MinigameKind, values: { id: string; value: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  if (kind === "tap") {
    const best = Math.max(0, ...values.map((v) => v.value));
    for (const v of values) out.set(v.id, Math.min(v.value, 120) * 5 + (best > 0 && v.value === best ? 200 : 0));
  } else if (kind === "target") {
    for (const v of values) out.set(v.id, Math.min(v.value, 30) * 40);
  }
  return out;
}

export type WheelEffect = "p500" | "p300" | "p200" | "double" | "all100";
export const WHEEL: { effect: WheelEffect; label: string; color: string }[] = [
  { effect: "p500", label: "+500", color: "#f43f5e" },
  { effect: "double", label: "×2", color: "#8b5cf6" },
  { effect: "p200", label: "+200", color: "#0ea5e9" },
  { effect: "all100", label: "+100 👥", color: "#10b981" },
  { effect: "p300", label: "+300", color: "#f59e0b" },
  { effect: "double", label: "×2", color: "#d946ef" },
];

export function wheelText(effect: WheelEffect, name: string): string {
  switch (effect) {
    case "p500":
      return `${name} +500 ochko yutdi!`;
    case "p300":
      return `${name} +300 ochko yutdi!`;
    case "p200":
      return `${name} +200 ochko yutdi!`;
    case "double":
      return `${name}: keyingi to'g'ri javob ×2!`;
    case "all100":
      return `${name} hammaga +100 ochko sovg'a qildi!`;
  }
}

export function wheelPoints(effect: WheelEffect): number {
  return effect === "p500" ? 500 : effect === "p300" ? 300 : effect === "p200" ? 200 : effect === "all100" ? 100 : 0;
}

/** G'ildirak segmenti va kim omadli — server tanlaydi */
export function spinWheel(playerCount: number, rngSegment = Math.random(), rngPlayer = Math.random()) {
  const segment = Math.min(WHEEL.length - 1, Math.floor(rngSegment * WHEEL.length));
  const player = Math.min(Math.max(playerCount - 1, 0), Math.floor(rngPlayer * playerCount));
  return { segment, effect: WHEEL[segment].effect, player };
}
