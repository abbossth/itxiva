// Savollar orasidagi qisqa o'yinlar: navbat, vaqt, ochko va omad g'ildiragi — sof funksiyalar.
// Bu fayl brauzerda ham ishlatiladi (ekranlar), shuning uchun serverga bog'liq emas.

export type MinigameKind = "tap" | "target" | "wheel" | "bonus" | "memory" | "math" | "colors" | "reaction";
// "Tezkor bosish" endi tanlanmaydi (o'quvchilar sichqonchani qiynab bosardi); tur faqat eski o'yinlar uchun qoldi.
// Yangi o'yinlar tez-tez bosishga emas — xotira, hisob, diqqat va reaksiyaga asoslangan: noto'g'ri bosish vaqt oladi.
export const MINIGAME_KINDS: MinigameKind[] = ["target", "memory", "math", "colors", "reaction", "wheel", "bonus"];
/** Tanlanish vazni: omad g'ildiragi eng sevimlisi — tez-tez chiqadi */
const MINIGAME_WEIGHT: Partial<Record<MinigameKind, number>> = { target: 2, memory: 2, math: 2, colors: 2, reaction: 2, wheel: 4, bonus: 1 };

export const MINIGAMES: Record<MinigameKind, { title: string; rule: string; seconds: number }> = {
  tap: { title: "Tezkor bosish", rule: "10 soniyada tugmani iloji boricha ko'p bosing!", seconds: 10 },
  target: { title: "Mo'ljalga otish", rule: "Nishonni uring, oltini — +3! Bombaga tegsangiz 2 soniya muzlaysiz", seconds: 15 },
  wheel: { title: "Omad g'ildiragi", rule: "G'ildirakni aylantiring: ochko, ×2, Super priz yoki Super baraban!", seconds: 12 },
  bonus: { title: "Bonus raund", rule: "Keyingi savol ikki baravar ochko beradi!", seconds: 5 },
  memory: { title: "Xotira", rule: "Chiroqlar ketma-ketligini eslab qoling va xuddi shunday bosing", seconds: 25 },
  math: { title: "Tez hisob", rule: "Misollarni yeching. Xato javob — 1,5 soniya pauza", seconds: 20 },
  colors: { title: "Rang tuzog'i", rule: "So'zni emas — uning RANGINI tanlang! Xato — 1,5 soniya pauza", seconds: 20 },
  reaction: { title: "Reaksiya", rule: "Ekran yashil bo'lganda bir marta bosing. Erta bossangiz — urinish kuyadi", seconds: 20 },
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

/** Tasodifiy tur (vaznli): oldingisi takrorlanmaydi */
export function pickMinigame(previous: MinigameKind | null, rng: number = Math.random()): MinigameKind {
  const pool = MINIGAME_KINDS.filter((k) => k !== previous);
  const total = pool.reduce((sum, k) => sum + (MINIGAME_WEIGHT[k] ?? 1), 0);
  let x = Math.min(Math.max(rng, 0), 0.999999) * total;
  for (const k of pool) {
    x -= MINIGAME_WEIGHT[k] ?? 1;
    if (x < 0) return k;
  }
  return pool[pool.length - 1];
}

/** Natija yuboriladigan o'yinlar (o'quvchi qurilmasida o'ynaladi) */
export type ScoredMinigame = "tap" | "target" | "memory" | "math" | "colors" | "reaction";
export function isScoredMinigame(kind: MinigameKind): kind is ScoredMinigame {
  return kind !== "wheel" && kind !== "bonus";
}

/** Bir o'yinchi uchun eng ko'p hisoblanadigan natija (soxta katta son yuborilsa ham) */
export const MINIGAME_CAP: Record<ScoredMinigame, number> = { tap: 150, target: 40, memory: 20, math: 40, colors: 40, reaction: 5000 };
/** Reaksiya: bundan tezi odam emas — hisoblanmaydi */
export const REACTION_MIN_MS = 120;

export function clampMinigameValue(kind: MinigameKind, value: unknown): number {
  const n = Math.floor(Number(value));
  if (!isScoredMinigame(kind) || !Number.isFinite(n) || n < 0) return 0;
  if (kind === "reaction") return n >= REACTION_MIN_MS ? Math.min(n, MINIGAME_CAP.reaction) : 0;
  return Math.min(n, MINIGAME_CAP[kind]);
}

/** Reaksiyada kichik son yaxshi (ms); 0 — urinish yo'q. Boshqalarida katta son yaxshi */
export function minigameBetter(kind: MinigameKind, a: number, b: number): boolean {
  if (kind === "reaction") return a > 0 && (b <= 0 || a < b);
  return a > b;
}

/** Reaksiya o'rinlari bo'yicha ochko */
const REACTION_PLACES = [500, 350, 250];

/**
 * Ochko: tezkor bosish — har bosish 5 (ko'pi bilan 120), eng tezga +200; mo'ljal — har nishon 40 (30 gacha);
 * xotira — har bosqich 80; tez hisob va rang tuzog'i — har to'g'ri javob 40; reaksiya — 1–3 o'rin 500/350/250, qolganlar 150.
 */
export function minigamePoints(kind: MinigameKind, values: { id: string; value: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  if (kind === "tap") {
    const best = Math.max(0, ...values.map((v) => v.value));
    for (const v of values) out.set(v.id, Math.min(v.value, 120) * 5 + (best > 0 && v.value === best ? 200 : 0));
  } else if (kind === "target") {
    for (const v of values) out.set(v.id, Math.min(v.value, 30) * 40);
  } else if (kind === "memory") {
    for (const v of values) out.set(v.id, Math.min(v.value, MINIGAME_CAP.memory) * 80);
  } else if (kind === "math" || kind === "colors") {
    for (const v of values) out.set(v.id, Math.min(v.value, MINIGAME_CAP[kind]) * 40);
  } else if (kind === "reaction") {
    const valid = values.filter((v) => v.value >= REACTION_MIN_MS).sort((a, b) => a.value - b.value);
    valid.forEach((v, i) => out.set(v.id, REACTION_PLACES[i] ?? 150));
    for (const v of values) if (!out.has(v.id)) out.set(v.id, 0);
  }
  return out;
}

export type WheelEffect = "p500" | "p300" | "p200" | "p100" | "double" | "super" | "superWheel" | "none";

/** Har bir o'quvchi o'z g'ildiragini aylantiradi: segmentlar va ularning tushish ehtimoli (vazn, jami 100) */
export const WHEEL: { effect: WheelEffect; label: string; icon: string; color: string; weight: number }[] = [
  { effect: "p500", label: "+500", icon: "💎", color: "#f43f5e", weight: 6 },
  { effect: "double", label: "×2", icon: "⚡", color: "#8b5cf6", weight: 11 },
  { effect: "p200", label: "+200", icon: "🎯", color: "#0ea5e9", weight: 22 },
  { effect: "p100", label: "+100", icon: "⭐", color: "#10b981", weight: 26 },
  { effect: "super", label: "PRIZ", icon: "🎁", color: "#eab308", weight: 7 },
  { effect: "p300", label: "+300", icon: "🔥", color: "#f97316", weight: 14 },
  { effect: "superWheel", label: "BARABAN", icon: "🎡", color: "#ec4899", weight: 5 },
  { effect: "none", label: "😅", icon: "", color: "#475569", weight: 9 },
];

/** O'quvchining o'z natijasi (ikkinchi shaxsda) */
export function wheelText(effect: WheelEffect): string {
  switch (effect) {
    case "p500":
      return "+500 ochko — katta yutuq!";
    case "p300":
      return "+300 ochko!";
    case "p200":
      return "+200 ochko!";
    case "p100":
      return "+100 ochko";
    case "double":
      return "Keyingi to'g'ri javob ×2!";
    case "super":
      return "SUPER PRIZ! O'yin oxirida sovg'a qutisini ochasiz";
    case "superWheel":
      return "SUPER BARABAN! O'yin oxirida uni aylantirasiz";
    case "none":
      return "Bu safar omad kulib boqmadi";
  }
}

export function wheelPoints(effect: WheelEffect): number {
  return effect === "p500" ? 500 : effect === "p300" ? 300 : effect === "p200" ? 200 : effect === "p100" ? 100 : 0;
}

function weighted(weights: number[], rng: number): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let x = Math.min(Math.max(rng, 0), 0.999999) * total;
  for (let i = 0; i < weights.length; i++) {
    if (x < weights[i]) return i;
    x -= weights[i];
  }
  return weights.length - 1;
}

/** Bitta o'quvchi uchun segment (vaznli tasodif) — server tanlaydi */
export function spinWheel(rng: number = Math.random()): number {
  return weighted(WHEEL.map((w) => w.weight), rng);
}

/* ---------------- O'yin oxiridagi sovg'alar (haqiqiy coin) ---------------- */

export type LivePrizeKind = "box" | "superWheel";

/** G'ildirakdagi segment qaysi sovg'ani beradi */
export function prizeOf(effect: WheelEffect): LivePrizeKind | null {
  return effect === "super" ? "box" : effect === "superWheel" ? "superWheel" : null;
}

/** Super priz qutisi: 5–20 coin, kichiklari tez-tez */
export const BOX_PRIZES: { coins: number; weight: number }[] = [
  { coins: 5, weight: 30 },
  { coins: 7, weight: 22 },
  { coins: 10, weight: 20 },
  { coins: 12, weight: 12 },
  { coins: 15, weight: 10 },
  { coins: 20, weight: 6 },
];

/** Super baraban: 5, 10, …, 50 coin — kattasi kamdan-kam */
export const SUPER_WHEEL: { coins: number; color: string; weight: number }[] = [
  { coins: 5, color: "#0ea5e9", weight: 22 },
  { coins: 10, color: "#10b981", weight: 20 },
  { coins: 15, color: "#8b5cf6", weight: 16 },
  { coins: 20, color: "#f97316", weight: 13 },
  { coins: 25, color: "#06b6d4", weight: 10 },
  { coins: 30, color: "#84cc16", weight: 7 },
  { coins: 35, color: "#a855f7", weight: 5 },
  { coins: 40, color: "#f43f5e", weight: 3.5 },
  { coins: 45, color: "#14b8a6", weight: 2 },
  { coins: 50, color: "#eab308", weight: 1.5 },
];

export function openBox(rng: number = Math.random()): number {
  return BOX_PRIZES[weighted(BOX_PRIZES.map((b) => b.weight), rng)].coins;
}

/** Super baraban segmenti (indeks) */
export function spinSuperWheel(rng: number = Math.random()): number {
  return weighted(SUPER_WHEEL.map((w) => w.weight), rng);
}
