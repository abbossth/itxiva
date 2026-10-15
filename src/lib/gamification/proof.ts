// Dalillarni normallashtirish. Server tashqi havolani hech qachon ochmaydi va yuklab olmaydi (SSRF xavfi) —
// faqat matn sifatida tekshiradi; mentor havolani o'zi yangi oynada ochadi. Bu fayl brauzerda ham ishlatiladi.

// Rasm brauzerda WebP ga siqib yuklanadi (upload-client), shuning uchun WebP ham qabul qilinadi
export const QUEST_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const QUEST_FILE_MAX_BYTES = 10 * 1024 * 1024;

const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|yclid|mc_cid|mc_eid|ref|ref_src)$/i;

/**
 * Faqat https havola qabul qilinadi. Normallashtirilgan ko'rinish takrorni aniqlash uchun: host kichik harflarda,
 * "www." siz, standart port, kuzatuv parametrlari va # qismi olib tashlangan, oxirgi "/" siz.
 * Noto'g'ri yoki https bo'lmagan havolada null.
 */
export function normalizeProofUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...url.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host}${url.port && url.port !== "443" ? `:${url.port}` : ""}${path}${query}`;
}

/** Sertifikat ID: katta harflar, bo'shliq, chiziqcha va nuqtalarsiz */
export function normalizeCertId(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/[\s\-_.:/]+/g, "");
  return v.length >= 3 && v.length <= 120 ? v : null;
}

export const PROOF_PLATFORMS = ["Coursera", "freeCodeCamp", "Cisco NetAcad", "Boshqa"];

/** Tayyor rad etish sabablari (mentor ro'yxatdan tanlaydi yoki o'zi yozadi) */
export const REJECT_REASONS = [
  "Havola ochilmaydi yoki sertifikatni tasdiqlamaydi",
  "Sertifikatdagi ism profilingizdagi ism bilan mos emas",
  "Sertifikat sanasi dasturga qo'shilishingizdan oldin",
  "Kurs dasturimizga tegishli emas",
  "Ish talablarga to'liq javob bermaydi",
  "Fayl o'qilmaydi yoki noto'liq",
];
