// "Bosh sahifada e'lon": o'quvchi coin evaziga hammaning bosh sahifasida e'lon, o'zi haqida yoki loyihasi haqida
// qisqa kartochka joylaydi. Ustoz tasdiqlagach chiqadi; rad etilsa yoki bekor qilinsa — coin qaytadi.
// Brauzer va server uchun umumiy.

export const PROMO_PRICE_PER_DAY = 150;
export const PROMO_MAX_DAYS = 3;
/** Bosh sahifada bir vaqtda ko'pi bilan shuncha e'lon (qolganlari navbatda) */
export const PROMO_MAX_ACTIVE = 3;
export const PROMO_TITLE_MAX = 60;
export const PROMO_TEXT_MAX = 200;

export const PROMO_KINDS = [
  { id: "announce", label: "E'lon", emoji: "📣" },
  { id: "me", label: "O'zim haqimda", emoji: "🙋" },
  { id: "project", label: "Loyiham", emoji: "🚀" },
] as const;
export type PromoKind = (typeof PROMO_KINDS)[number]["id"];

export const PROMO_EMOJIS = ["📣", "🚀", "💻", "🎮", "🎨", "🤖", "📚", "🏆", "🎉", "⚽", "🎵", "🌟", "🔥", "💡", "🐍", "🙋"];

export const PROMO_COLORS = [
  { id: "teal", from: "#14b8a6", to: "#0ea5e9" },
  { id: "violet", from: "#8b5cf6", to: "#ec4899" },
  { id: "amber", from: "#f59e0b", to: "#ef4444" },
  { id: "emerald", from: "#10b981", to: "#84cc16" },
  { id: "indigo", from: "#6366f1", to: "#06b6d4" },
  { id: "rose", from: "#f43f5e", to: "#f97316" },
] as const;
export type PromoColor = (typeof PROMO_COLORS)[number]["id"];
export const colorOfPromo = (id: string) => PROMO_COLORS.find((c) => c.id === id) ?? PROMO_COLORS[0];

export const promoPrice = (days: number) => PROMO_PRICE_PER_DAY * Math.min(PROMO_MAX_DAYS, Math.max(1, Math.floor(days)));

/** Havola: faqat http(s); bo'sh bo'lishi mumkin */
export function cleanPromoLink(raw: unknown): string | null | false {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const v = raw.trim().slice(0, 300);
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname.includes(".")) return false;
    return u.toString();
  } catch {
    return false;
  }
}

export interface PromoView {
  id: string;
  kind: PromoKind;
  title: string;
  text: string;
  link: string | null;
  emoji: string;
  color: string;
  author: string;
  group: string | null;
  days: number;
  price: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  createdAt: string;
}
