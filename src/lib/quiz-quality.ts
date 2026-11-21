// Test savollari sifati: to'g'ri javob boshqa variantlardan ancha uzun bo'lsa, o'quvchilar uni uzunligidan topib oladi.
// Sof funksiyalar — server, mijoz va testlarda ishlatiladi.

export interface ChoiceQuestionLike {
  type: string;
  options?: string[];
  correctAnswers?: string[];
}

export interface LengthBias {
  biased: boolean;
  /** To'g'ri javob(lar) o'rtacha uzunligining noto'g'rilar o'rtachasiga nisbati */
  ratio: number;
  correctLen: number;
  wrongLen: number;
}

const len = (s: string) => s.trim().replace(/\s+/g, " ").length;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * To'g'ri javob uzunligidan "sezilib" qoladimi:
 * - to'g'ri javob(lar) o'rtacha uzunligi noto'g'rilar o'rtachasidan 1,5 barobar va kamida 8 belgiga uzun bo'lsa;
 * - bitta javobli savolda u, qo'shimcha ravishda, eng uzun noto'g'ri variantdan ham 1,15 barobar uzun bo'lsa.
 * Qisqa variantlar (masalan "12" va "15") hisobga olinmaydi.
 */
export function answerLengthBias(q: ChoiceQuestionLike): LengthBias {
  const none: LengthBias = { biased: false, ratio: 1, correctLen: 0, wrongLen: 0 };
  if (q.type !== "single_choice" && q.type !== "multiple_choice") return none;
  const options = (q.options ?? []).filter((o) => o.trim());
  const correct = new Set(q.correctAnswers ?? []);
  const right = options.filter((o) => correct.has(o)).map(len);
  const wrong = options.filter((o) => !correct.has(o)).map(len);
  if (right.length === 0 || wrong.length < 2) return none;
  const correctLen = avg(right);
  const wrongLen = avg(wrong);
  const ratio = wrongLen > 0 ? correctLen / wrongLen : correctLen > 0 ? Infinity : 1;
  let biased = ratio >= 1.5 && correctLen - wrongLen >= 8;
  if (biased && q.type === "single_choice") biased = correctLen >= Math.max(...wrong) * 1.15;
  return { biased, ratio: Math.round(ratio * 100) / 100, correctLen: Math.round(correctLen), wrongLen: Math.round(wrongLen) };
}

/** Savol matni uzunligiga qarab shrift kichrayishi (1 — to'liq o'lcham) */
export function promptScale(text: string): number {
  const n = text.trim().length;
  const lines = text.split("\n").length;
  const weight = n + Math.max(0, lines - 1) * 40;
  if (weight <= 80) return 1;
  if (weight <= 140) return 0.85;
  if (weight <= 220) return 0.72;
  if (weight <= 340) return 0.6;
  return 0.5;
}

/** Barqaror aralashtirish: bir xil `seed` — bir xil tartib (sahifa yangilansa o'zgarmaydi), har o'quvchida har xil */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  // FNV-1a xesh + mulberry32
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
