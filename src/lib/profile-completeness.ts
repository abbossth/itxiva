// Shaxsiy ma'lumotlar qanchalik to'ldirilgani. O'quvchida ikki hujjatdan bittasi bo'ladi: kichiklarda tug'ilganlik
// haqidagi guvohnoma, 16 yoshdan — pasport yoki ID-karta. Shuning uchun 100% hisobiga faqat tanlangan hujjat kiradi.
// Forma (brauzer) va server (coin mukofoti) aynan bitta hisobdan foydalanadi.

export type DocumentType = "birthCert" | "passport";

export const BASIC_KEYS = ["birthDate", "gender", "phone", "school", "address"] as const;
export const PARENT_KEYS = ["fatherName", "fatherPhone", "motherName", "motherPhone"] as const;
export const BIRTH_CERT_KEYS = ["birthCertNumber", "birthCertIssuedAt", "birthCertIssuedBy"] as const;
export const PASSPORT_KEYS = ["passportNumber", "pinfl", "passportIssuedAt", "passportExpiresAt", "passportIssuedBy"] as const;

/** Profil 100% to'ldirilganda bir marta beriladigan coin */
export const PROFILE_COMPLETE_REWARD = 10;
export const profileRewardKey = (studentId: string) => `profile-complete:${studentId}`;

/** O'zbekistonda pasport (ID-karta) 16 yoshda beriladi */
const PASSPORT_AGE = 16;

type ProfileValues = Partial<Record<string, unknown>> & { documentType?: string; birthDate?: string };

export const isFilled = (v: unknown) => String(v ?? "").trim() !== "";
export const countFilled = (d: ProfileValues, keys: readonly string[]) => keys.filter((k) => isFilled(d[k])).length;

/** Tug'ilgan sanadan ("YYYY-MM-DD") to'liq yosh */
export function ageOf(birthDate: string | undefined, now = new Date()): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 120 ? age : null;
}

/**
 * Qaysi hujjat hisobga olinadi: tanlangani; tanlanmagan bo'lsa — qaysi biri to'ldirila boshlangani;
 * hech biri bo'lmasa — yoshga qarab (16 dan katta — pasport).
 */
export function resolveDocumentType(d: ProfileValues, now = new Date()): DocumentType {
  if (d.documentType === "birthCert" || d.documentType === "passport") return d.documentType;
  const passport = countFilled(d, PASSPORT_KEYS);
  const birthCert = countFilled(d, BIRTH_CERT_KEYS);
  if (passport > 0 || birthCert > 0) return passport >= birthCert ? "passport" : "birthCert";
  const age = ageOf(d.birthDate, now);
  return age !== null && age >= PASSPORT_AGE ? "passport" : "birthCert";
}

export function profileCompleteness(d: ProfileValues, now = new Date()) {
  const documentType = resolveDocumentType(d, now);
  const keys = [...BASIC_KEYS, ...PARENT_KEYS, ...(documentType === "passport" ? PASSPORT_KEYS : BIRTH_CERT_KEYS)];
  const filled = countFilled(d, keys);
  return { documentType, filled, total: keys.length, percent: Math.round((filled / keys.length) * 100), complete: filled === keys.length };
}
