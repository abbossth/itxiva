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
  str = str.replace(/o['`ʻ‘]r?/g, "o").replace(/g['`ʻ‘]/g, "g");
  for (const [key, val] of Object.entries(map)) {
    str = str.split(key).join(val);
  }
  return str
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
}

/**
 * Format date in Uzbek locale
 */
export function formatDateUz(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
