// Ikki javob matnining o'xshashligi (ko'chirishni aniqlash uchun). Belgilar bo'yicha 5-gramlar solishtiriladi:
// ko'chirilgan matn imlo xatolari, bo'shliqlar va ifodalari bilan birga mos keladi, mustaqil yozilgan to'g'ri javoblar esa
// odatda boshqacha yoziladi.

const N = 5;
/** Bundan qisqa matnlar solishtirilmaydi: "Foto yubordim" kabi javoblar hammada bir xil bo'lishi tabiiy */
export const MIN_SIMILARITY_CHARS = 80;

export function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(text: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + N <= text.length; i++) set.add(text.slice(i, i + N));
  return set;
}

/**
 * 0…1: qisqaroq javobning qancha qismi ikkinchisida ham bor. Topshiriq matnidan olingan bo'laklar hisobga olinmaydi —
 * o'quvchilar savolni ko'chirib yozishi ko'chirmachilik emas.
 */
export function textSimilarity(a: string, b: string, ignore = ""): number {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na.length < MIN_SIMILARITY_CHARS || nb.length < MIN_SIMILARITY_CHARS) return 0;

  const skip = shingles(normalizeForSimilarity(ignore));
  const sa = new Set([...shingles(na)].filter((s) => !skip.has(s)));
  const sb = new Set([...shingles(nb)].filter((s) => !skip.has(s)));
  const smaller = Math.min(sa.size, sb.size);
  if (smaller < MIN_SIMILARITY_CHARS / 2) return 0;

  let common = 0;
  for (const s of sa) if (sb.has(s)) common += 1;
  return common / smaller;
}
