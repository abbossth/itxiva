// O'quvchilar ro'yxatidan (PDF yoki Excel'dan nusxa olingan matn) hujjat raqamlarini ajratib oladi:
// "12 ZARIPBOYEVA DILNURA MANSURBEK QIZI 60402127210021 I-HR 0630583 Xiva shahri 8 ..." ->
// { fullName, pinfl: "60402127210021", docNumber: "I-HR 0630583", docKind: "birthCert" }.
// Brauzerda ham, serverda ham ishlaydi (Node modullari yo'q).

export type DocKind = "birthCert" | "passport";

export interface ParsedDocumentRow {
  fullName: string;
  pinfl: string;
  /** JSHSHIR nazorat raqami to'g'ri kelmasa false — bunday JSHSHIR saqlanmaydi */
  pinflValid: boolean;
  docNumber: string;
  docKind: DocKind;
}

export interface ParsedDocuments {
  rows: ParsedDocumentRow[];
  /** Bir o'quvchi uchun ro'yxatda bir-biriga zid ikki to'g'ri JSHSHIR — ular saqlanmaydi */
  conflicts: { fullName: string; values: string[] }[];
}

const LETTER = "A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ‘’ʻʼ'`";
const WORD = `[${LETTER}][${LETTER}-]*`;
// FISH (2–6 so'z, bir qator ichida) · JSHSHIR (14 raqam) · seriya (I-HR, AB, ...) va raqam (6–7 raqam)
const ROW_RE = new RegExp(
  `(${WORD}(?:[ \\t]+${WORD}){1,5})[ \\t]+(\\d{14})[ \\t]+([A-Za-zА-Яа-я]{1,3}(?:-[A-Za-zА-Яа-я]{1,3})?)[ \\t]?(\\d{6,7})(?!\\d)`,
  "g"
);

/** JSHSHIR nazorat raqami: birinchi 13 raqam 7-3-1 og'irliklar bilan, yig'indi mod 10 = 14-raqam */
export function isValidPinfl(pinfl: string): boolean {
  if (!/^\d{14}$/.test(pinfl)) return false;
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(pinfl[i]) * weights[i % 3];
  return sum % 10 === Number(pinfl[13]);
}

/** JSHSHIRdan tug'ilgan sana ("YYYY-MM-DD") va jins: 1-raqam asr va jinsni, 2–7 raqamlar KKOOYY ni bildiradi */
export function pinflBirthInfo(pinfl: string): { birthDate: string; gender: "male" | "female" } | null {
  if (!isValidPinfl(pinfl)) return null;
  const code = Number(pinfl[0]);
  const century = code <= 2 ? 1800 : code <= 4 ? 1900 : code <= 6 ? 2000 : 0;
  if (!century) return null;
  const day = Number(pinfl.slice(1, 3));
  const month = Number(pinfl.slice(3, 5));
  const year = century + Number(pinfl.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { birthDate: date.toISOString().slice(0, 10), gender: code % 2 === 1 ? "male" : "female" };
}

/** "i-hr0351824" -> "I-HR 0351824"; AB/AA/AC... (7 raqam) — pasport, qolganlari tug'ilganlik guvohnomasi */
export function normalizeDocNumber(series: string, number: string): { docNumber: string; docKind: DocKind } {
  const s = series.toUpperCase();
  const isPassport = /^A[A-Z]$/.test(s) && number.length === 7;
  return { docNumber: `${s} ${number}`, docKind: isPassport ? "passport" : "birthCert" };
}

const nameId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Matndagi barcha o'quvchi qatorlari. Bir o'quvchi ro'yxatda bir necha marta uchrasa: nazorat raqami
 * to'g'ri JSHSHIR afzal, keyingi uchragani (yangiroq jadval) avvalgisining o'rnini bosadi;
 * ikkalasi ham to'g'ri, lekin har xil bo'lsa — ziddiyat, JSHSHIR bo'sh qoldiriladi.
 */
export function parseDocumentText(text: string): ParsedDocuments {
  const byName = new Map<string, ParsedDocumentRow>();
  const validValues = new Map<string, Set<string>>();

  for (const m of text.matchAll(ROW_RE)) {
    // Oldidagi tartib raqami yoki boshqa ustundagi so'zlar ilashib qolmasin: ism katta harf bilan boshlanadi
    const fullName = m[1].replace(/\s+/g, " ").trim();
    const pinfl = m[2];
    const row: ParsedDocumentRow = {
      fullName,
      pinfl,
      pinflValid: isValidPinfl(pinfl),
      ...normalizeDocNumber(m[3], m[4]),
    };
    const id = nameId(fullName);
    if (row.pinflValid) {
      const set = validValues.get(id) ?? new Set<string>();
      set.add(pinfl);
      validValues.set(id, set);
    }
    const prev = byName.get(id);
    if (prev && prev.pinflValid && !row.pinflValid) {
      // Noto'g'ri JSHSHIRli takror qator: faqat hujjat raqami yangilanadi
      byName.set(id, { ...prev, docNumber: row.docNumber, docKind: row.docKind });
    } else {
      byName.set(id, row);
    }
  }

  const conflicts: ParsedDocuments["conflicts"] = [];
  const rows = [...byName.entries()].map(([id, row]) => {
    const values = validValues.get(id);
    if (values && values.size > 1) {
      conflicts.push({ fullName: row.fullName, values: [...values] });
      return { ...row, pinfl: "", pinflValid: false };
    }
    return row;
  });
  return { rows, conflicts };
}

/** Ko'rsatish uchun: "60402127210021" -> "604•••••••021" */
export function maskValue(value: string): string {
  if (value.length <= 6) return value;
  return `${value.slice(0, 3)}${"•".repeat(Math.max(3, value.length - 6))}${value.slice(-3)}`;
}
