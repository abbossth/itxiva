// Excel'dagi FISH ni bazadagi o'quvchi ismi bilan solishtirish uchun yordamchi funksiyalar.
// Bazadagi ismlar "Familiya Ism" yoki "Ism Familiya" tartibida, otasining ismisiz bo'lishi mumkin.

const PATRONYMIC_TAILS = new Set(["qizi", "ogli", "ugli", "kizi", "ogl", "ugl"]);

/** Apostrof va registr farqlarini yo'qotadi: "O‘RINOVA Nurhayot" -> ["orinova", "nurhayot"] */
export function nameTokens(fullName: string): string[] {
  return fullName
    .toLowerCase()
    .replace(/[’‘ʻʼ'`´]/g, "")
    .replace(/[^a-zа-яёўқғҳ\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && !PATRONYMIC_TAILS.has(t));
}

/** Familiya + ism (tartibdan qat'i nazar) kaliti */
export function nameKey(fullName: string): string {
  return nameTokens(fullName).slice(0, 2).sort().join(" ");
}

/** Yozilishdagi keng tarqalgan farqlarni tenglashtiradi (x/h, ou/u, takror harflar) */
export function fuzzyKey(fullName: string): string {
  return nameTokens(fullName)
    .slice(0, 2)
    .map((t) =>
      t
        .replace(/kh/g, "h")
        .replace(/x/g, "h")
        .replace(/yo/g, "o")
        .replace(/ya/g, "a")
        .replace(/dj/g, "j")
        .replace(/(.)\1+/g, "$1")
    )
    .sort()
    .join(" ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** "ZARIPBOYEVA DILNURA MANSURBEK QIZI" -> "Zaripboyeva Dilnura Mansurbek qizi" */
export function toDisplayName(fullName: string): string {
  return fullName
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (PATRONYMIC_TAILS.has(lower.replace(/[’‘ʻʼ'`´]/g, ""))) return lower;
      return lower.replace(/^[a-zа-яёўқғҳ]/, (c) => c.toUpperCase());
    })
    .join(" ");
}
