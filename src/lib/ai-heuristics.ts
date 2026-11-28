// AI'siz ishlaydigan "AI yozganmi?" belgilari: matndagi aniq izlar (markdown, chatbot iboralari, klaviaturada
// terilmaydigan belgilar), o'quvchining avvalgi ishlaridan keskin farq va yozish jarayoni (qancha qismi
// joylashtirilgan — paste, qancha vaqt yozilgan). Natija — taxmin: har bir belgi iqtibos bilan, mentor o'zi xulosa qiladi.
// Sof funksiyalar (server, test).

import { normalizeForSimilarity } from "@/lib/similarity";

export const MIN_HEURISTIC_CHARS = 120;

/** Javob maydonida yozish jarayoni (brauzer o'lchaydi) */
export interface Authoring {
  /** Qo'lda terilgan belgilar */
  typed: number;
  /** Joylashtirilgan (paste) belgilar */
  pasted: number;
  /** Joylashtirishlar soni */
  pastes: number;
  /** Maydonda faol yozish vaqti, ms */
  ms: number;
}

export interface HeuristicResult {
  /** 0–100; null — matn juda qisqa */
  score: number | null;
  signals: string[];
}

const quote = (s: string) => `«${s.replace(/\s+/g, " ").trim().slice(0, 60)}»`;

const CHATBOT_PHRASES = [
  "albatta!",
  "albatta,",
  "keling,",
  "keling ko'rib chiqamiz",
  "xulosa qilib aytganda",
  "xulosa o'rnida",
  "umid qilamanki",
  "shuni ta'kidlash joizki",
  "quyida keltirilgan",
  "quyidagicha tushuntirish",
  "bu misolda biz",
  "certainly",
  "let's break",
  "in conclusion",
  "i hope this helps",
  "here's",
  "конечно",
  "давайте разберём",
  "давайте разберем",
  "в заключение",
  "надеюсь, это поможет",
];

/** Kodga o'xshaydimi (qavslar, nuqtali vergul, teglar, kalit so'zlar) */
export function looksLikeCode(text: string): boolean {
  const lines = text.split("\n");
  const codeish = lines.filter((l) => /[{};]\s*$|^\s*(def|class|function|const|let|var|import|for|while|if|return|print|<\/?[a-z][\w-]*[\s>])/i.test(l)).length;
  return codeish >= 3 || codeish / Math.max(1, lines.length) > 0.3;
}

/**
 * Matn va yozish jarayoniga qarab AI/ko'chirish ehtimoli. `previous` — shu o'quvchining avvalgi javoblari.
 */
export function heuristicAiSignals(text: string, previous: string[] = [], authoring: Authoring | null = null): HeuristicResult {
  const norm = normalizeForSimilarity(text);
  if (norm.length < MIN_HEURISTIC_CHARS) return { score: null, signals: [] };
  const code = looksLikeCode(text);
  const signals: string[] = [];
  let score = 0;
  const add = (w: number, s: string) => {
    score += w;
    signals.push(s);
  };

  // Markdown (chatbot javobidan ko'chirilganda qoladi)
  const bold = text.match(/\*\*[^*\n]{2,60}\*\*/);
  if (bold) add(25, `Markdown qalin matn: ${quote(bold[0])}`);
  const heading = text.match(/^#{1,4}\s+\S.*$/m);
  if (heading && !code) add(25, `Markdown sarlavha: ${quote(heading[0])}`);
  if (/^\s*\|.+\|\s*$/m.test(text) && (text.match(/^\s*\|.+\|\s*$/gm)?.length ?? 0) >= 3) add(20, "Markdown jadval");

  // Chatbot iboralari
  const lower = text.toLowerCase().replace(/[‘’ʻʼ`´]/g, "'");
  const phrase = CHATBOT_PHRASES.find((p) => lower.includes(p));
  if (phrase) add(25, `Chatbotga xos ibora: ${quote(phrase)}`);

  // Telefon/klaviaturada odatda terilmaydigan belgilar
  const special = text.match(/[×÷→←⇒≈≤≥—“”•…]/g);
  if (special && special.length >= 2) add(15, `Odatda terilmaydigan belgilar: ${[...new Set(special)].slice(0, 6).join(" ")}`);
  // O'zbekcha tutuq belgisi uchun maxsus harflar (ʻ ʼ) — avtomatik yaratilgan matnda uchraydi
  const okina = text.match(/[a-z]ʻ|ʼ/i);
  if (okina && (text.match(/[ʻʼ]/g)?.length ?? 0) >= 3) add(15, "Maxsus tutuq belgisi (ʻ ʼ) izchil ishlatilgan — odatda ' yoki ` teriladi");

  // Avvalgi ishlardan keskin farq (hajm va savodxonlik)
  const prev = previous.map(normalizeForSimilarity).filter((p) => p.length >= 40);
  if (prev.length >= 2 && !code) {
    const avg = prev.reduce((a, p) => a + p.length, 0) / prev.length;
    if (norm.length > avg * 4 && norm.length > 600) add(15, `Javob avvalgi ishlaridan ancha uzun (${Math.round(norm.length / avg)} baravar)`);
    const punct = (s: string) => (s.match(/[,;:]/g)?.length ?? 0) / Math.max(1, s.split(" ").length);
    const prevPunct = prev.reduce((a, p) => a + punct(p), 0) / prev.length;
    if (punct(norm) > prevPunct * 3 && punct(norm) > 0.12) add(10, "Tinish belgilari avvalgi ishlariga qaraganda ancha ko'p va mukammal");
  }

  // Yozish jarayoni: matn asosan joylashtirilgan (paste) va juda tez tayyor bo'lgan
  if (authoring) {
    const total = authoring.typed + authoring.pasted;
    if (total >= MIN_HEURISTIC_CHARS) {
      const pastedShare = authoring.pasted / total;
      const minutes = Math.max(1, Math.round(authoring.ms / 60_000));
      if (pastedShare >= 0.8) {
        const what = `Matnning ${Math.round(pastedShare * 100)}% i tayyor holda joylashtirilgan (paste, ${authoring.pastes} marta), qo'lda ~${authoring.typed} belgi yozilgan, ~${minutes} daqiqa`;
        // Kodni muharrirda yozib, keyin joylashtirish tabiiy — kod uchun zaifroq belgi
        add(code ? 10 : 35, code ? `${what} (kod uchun bu odatiy bo'lishi mumkin)` : what);
      } else if (authoring.typed >= 200 && pastedShare < 0.2) {
        signals.push(`Matn qo'lda yozilgan (~${authoring.typed} belgi, ~${minutes} daqiqa) — o'quvchi o'zi yozganiga ishora`);
        score -= 10;
      }
    }
  }

  return { score: Math.max(0, Math.min(90, score)), signals };
}

// ---- Kod o'xshashligi: nomlar, izohlar, satrlar va bo'shliqlar o'zgartirilsa ham ko'chirma topiladi ----

const KEYWORDS = new Set(
  "if else for while do return function def class const let var import from export new this self print input range len in of and or not true false null none break continue try except catch finally switch case default public private static void int float str string bool async await lambda yield with as is html head body div span p a img ul li ol table tr td style script link meta title h1 h2 h3 form button".split(
    " "
  )
);

/** Kodni tokenlarga ajratadi: nomlar → "v", sonlar → "n", satrlar → "s", izohlar o'chiriladi */
export function codeTokens(text: string): string[] {
  const noComments = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*#(?!include).*$/gm, " ");
  const tokens: string[] = [];
  const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\d+(?:\.\d+)?)|([A-Za-z_][\w-]*)|([^\s\w])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) {
    if (m[1]) tokens.push("s");
    else if (m[2]) tokens.push("n");
    else if (m[3]) tokens.push(KEYWORDS.has(m[3].toLowerCase()) ? m[3].toLowerCase() : "v");
    else if (m[4]) tokens.push(m[4]);
  }
  return tokens;
}

const K = 6;

/** Kodning 6 tokenlik bo'laklari (bo'sh — kod emas yoki juda qisqa) */
export function codeGrams(text: string): Set<string> {
  const t = codeTokens(text);
  const s = new Set<string>();
  if (t.length < 30) return s;
  for (let i = 0; i + K <= t.length; i++) s.add(t.slice(i, i + K).join(" "));
  return s;
}

/**
 * 0…1: qisqaroq kodning qancha qismi ikkinchisida ham bor. `common` — hisobga olinmaydigan bo'laklar: topshiriq
 * matnidagilar va shu vazifaga kelgan javoblarning ko'pchiligida uchraydiganlar (hamma yozadigan tuzilma
 * ko'chirma emas — MOSS usuli).
 */
export function codeContainment(ga: Set<string>, gb: Set<string>, common: Set<string> = new Set()): number {
  let sa = 0;
  let sb = 0;
  for (const g of ga) if (!common.has(g)) sa++;
  for (const g of gb) if (!common.has(g)) sb++;
  const smaller = Math.min(sa, sb);
  if (smaller < 15) return 0;
  let shared = 0;
  for (const g of ga) if (!common.has(g) && gb.has(g)) shared++;
  return shared / smaller;
}

/** Ko'p javobda uchraydigan bo'laklar: `share` dan ko'p (kamida 3 ta) javobda bor bo'lsa — umumiy */
export function commonGrams(all: Set<string>[], share = 0.25): Set<string> {
  const df = new Map<string, number>();
  for (const set of all) for (const g of set) df.set(g, (df.get(g) ?? 0) + 1);
  const limit = Math.max(3, Math.ceil(all.length * share));
  const out = new Set<string>();
  for (const [g, n] of df) if (n >= limit) out.add(g);
  return out;
}

/** Ikki kod uchun qulay: topshiriq matni bo'laklari hisobga olinmaydi */
export function codeSimilarity(a: string, b: string, ignore = ""): number {
  return codeContainment(codeGrams(a), codeGrams(b), codeGrams(ignore));
}
