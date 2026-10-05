import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format full name to short format for privacy: "Ali Valiyev" -> "Ali V."
 */
export function formatShortName(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastNameInitial = parts[1][0] ? `${parts[1][0].toUpperCase()}.` : "";
  return `${firstName} ${lastNameInitial}`.trim();
}

/**
 * Transliterate Uzbek name to slug/login format: "Alisher Valiyev" -> "alisher_valiyev"
 */
export function slugifyLogin(fullName: string): string {
  const map: Record<string, string> = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "ў": "o", "қ": "q", "ғ": "g", "ҳ": "h",
    "o'": "o", "g'": "g", "sh": "sh", "ch": "ch", "oʻ": "o", "gʻ": "g",
    "’": "", "‘": "", "'": "", "`": "",
  };

  let str = fullName.toLowerCase().trim();
  // replace uzbek specific apostrophes
  str = str.replace(/o['`ʻ‘’]/g, "o").replace(/g['`ʻ‘’]/g, "g");
  for (const [key, val] of Object.entries(map)) {
    str = str.split(key).join(val);
  }
  return str
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
}

// Platforma Xiva (O'zbekiston) uchun: server (UTC) va brauzerda bir xil natija chiqishi uchun vaqt zonasi qat'iy belgilanadi
const APP_TIME_ZONE = "Asia/Tashkent";

const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

// "uz-UZ" lokali Node.js va brauzerlarda turlicha chiqadi (hydration xatosiga olib keladi),
// shuning uchun sana qismlari ajratib olinib, matn qo'lda yig'iladi
const datePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getDateParts(date: Date | string | number) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts: Record<string, string> = {};
  for (const part of datePartsFormatter.formatToParts(d)) {
    parts[part.type] = part.value;
  }
  return parts;
}

/**
 * Format date in Uzbek: "4-okt, 2026"
 */
export function formatDateUz(date: Date | string | number): string {
  const p = getDateParts(date);
  if (!p) return "";
  return `${Number(p.day)}-${UZ_MONTHS_SHORT[Number(p.month) - 1]}, ${p.year}`;
}

/**
 * Format date and time in Uzbek: "4-okt, 2026 14:30"
 */
export function formatDateTimeUz(date: Date | string | number): string {
  const p = getDateParts(date);
  if (!p) return "";
  return `${formatDateUz(date)} ${p.hour}:${p.minute}`;
}

/**
 * Format time only: "14:30"
 */
export function formatTimeUz(date: Date | string | number): string {
  const p = getDateParts(date);
  if (!p) return "";
  return `${p.hour}:${p.minute}`;
}

/**
 * Value for <input type="datetime-local"> in the user's local time zone
 */
export function toDateTimeLocalValue(date: Date | string | number): string {
  const d = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
