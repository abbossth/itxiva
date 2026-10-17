// Qidiruv palitrasi: matnni solishtirish, natijalarni saralash va topilgan qismni belgilash.
// Sof funksiyalar — brauzerda har bosilgan harfda bir zumda ishlaydi va testlanadi.

export type SearchKind = "lesson" | "material" | "exam" | "quest" | "product" | "student" | "group";

export interface SearchItem {
  id: string;
  kind: SearchKind;
  title: string;
  /** Qisqa izoh: guruh, chorak, dars nomi va h.k. */
  subtitle?: string;
  href: string;
  /** Qidiruvda hisobga olinadigan, lekin ko'rsatilmaydigan so'zlar */
  keywords?: string;
}

// O'zbek va rus kirill harflari lotinchaga: "дарс" ham "dars" ni topadi
const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh",
  щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

const APOSTROPHES = /[`'ʻʼ‘’]/;

/**
 * Solishtirish uchun ko'rinish: kichik harf, apostrofsiz (o'/oʻ/o` bir xil), kirill lotinga o'girilgan.
 * `map[i]` — natijadagi i-belgining asl matndagi o'rni (belgilash uchun).
 */
export function normalizeWithMap(value: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i].toLowerCase();
    if (APOSTROPHES.test(ch)) continue;
    const out = CYRILLIC[ch] ?? ch;
    for (const c of out) {
      text += c;
      map.push(i);
    }
  }
  return { text, map };
}

export const normalizeSearch = (value: string): string => normalizeWithMap(value).text;

/** So'rovni so'zlarga ajratadi (bo'sh joy bo'yicha) */
export function queryTokens(query: string): string[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean);
}

const isWordStart = (text: string, at: number) => at === 0 || /[^a-z0-9]/.test(text[at - 1]);

function tokenScore(title: string, rest: string, token: string): number {
  const at = title.indexOf(token);
  if (at === 0) return 100;
  if (at > 0) {
    // So'z boshidan topilgani o'rtadan topilganidan yuqori turadi
    let i = at;
    while (i !== -1) {
      if (isWordStart(title, i)) return 70;
      i = title.indexOf(token, i + 1);
    }
    return 40;
  }
  return rest.includes(token) ? 15 : 0;
}

/**
 * Element so'rovga qanchalik mos: 0 — mos emas (har bir so'z sarlavha, izoh yoki kalit so'zlarda bo'lishi shart).
 * Sarlavha boshidan topilsa eng yuqori, keyin so'z boshidan, keyin o'rtadan, keyin izoh/kalit so'zlardan.
 */
export function scoreItem(item: { title: string; subtitle?: string; keywords?: string }, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const title = normalizeSearch(item.title);
  const rest = normalizeSearch(`${item.subtitle ?? ""} ${item.keywords ?? ""}`);
  let total = 0;
  for (const token of tokens) {
    const s = tokenScore(title, rest, token);
    if (s === 0) return 0;
    total += s;
  }
  // To'liq mos sarlavha va qisqa sarlavhalar biroz yuqoriroq
  if (title === tokens.join(" ")) total += 50;
  return total + Math.max(0, 20 - title.length / 4);
}

/** Sarlavhadagi topilgan qismlar ([boshi, oxiri) asl matn bo'yicha), bir-biriga qo'shilgan holda */
export function highlightRanges(text: string, tokens: string[]): [number, number][] {
  if (tokens.length === 0) return [];
  const { text: norm, map } = normalizeWithMap(text);
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    let at = norm.indexOf(token);
    while (at !== -1) {
      ranges.push([map[at], map[at + token.length - 1] + 1]);
      at = norm.indexOf(token, at + token.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Mos elementlar, eng moslari birinchi; teng bo'lsa asl tartib saqlanadi */
export function rankItems<T extends { title: string; subtitle?: string; keywords?: string }>(items: T[], query: string, limit = Infinity): { item: T; score: number }[] {
  const tokens = queryTokens(query);
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const score = scoreItem(item, tokens);
    if (score > 0) scored.push({ item, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, limit).map(({ item, score }) => ({ item, score }));
}
