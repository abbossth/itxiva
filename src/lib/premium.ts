// IT Xiva Premium: monthly subscription bought with coins. Pure module (browser, server, tests).

export const PREMIUM_PRICE = 150;
export const PREMIUM_DAYS = 30;
const DAY = 86_400_000;

export interface PremiumStyle {
  font: string;
  badge: string;
  bubble: string;
}

/** Name fonts (CSS family comes from lib/premium-fonts.ts) */
export const NAME_FONTS = [
  { id: "classic", label: "Oddiy" },
  { id: "pacifico", label: "Nafis" },
  { id: "lobster", label: "Qalin yozma" },
  { id: "pixel", label: "Piksel" },
  { id: "comfortaa", label: "Yumshoq" },
  { id: "caveat", label: "Qo'lyozma" },
  { id: "righteous", label: "Kosmik" },
  { id: "bungee", label: "Plakat" },
] as const;

/** Badge shown next to the name */
export const PREMIUM_BADGES = ["👑", "💎", "⚡", "🔥", "🌟", "🚀", "🐉", "🎮", "🦁", "🍉"] as const;

/** Name / bubble colors: gradient stops */
export const PREMIUM_BUBBLES = [
  { id: "violet", label: "Binafsha", from: "#8b5cf6", to: "#ec4899" },
  { id: "ocean", label: "Okean", from: "#0ea5e9", to: "#6366f1" },
  { id: "sunset", label: "Quyosh botishi", from: "#f97316", to: "#e11d48" },
  { id: "forest", label: "O'rmon", from: "#10b981", to: "#0d9488" },
  { id: "gold", label: "Oltin", from: "#f59e0b", to: "#eab308" },
  { id: "night", label: "Tun", from: "#334155", to: "#1e1b4b" },
] as const;

export const DEFAULT_STYLE: PremiumStyle = { font: "pacifico", badge: "👑", bubble: "violet" };

export const isPremium = (until: Date | string | null | undefined, now = Date.now()) => Boolean(until && new Date(until).getTime() > now);

/** New end date after buying one month: extends an active subscription, otherwise starts now */
export function extendPremium(until: Date | string | null | undefined, now = Date.now()): Date {
  const base = isPremium(until, now) ? new Date(until as string | Date).getTime() : now;
  return new Date(base + PREMIUM_DAYS * DAY);
}

export const daysLeft = (until: Date | string | null | undefined, now = Date.now()) => (isPremium(until, now) ? Math.ceil((new Date(until as string | Date).getTime() - now) / DAY) : 0);

/** Keep only known style values */
export function cleanStyle(raw: unknown): PremiumStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const font = NAME_FONTS.some((f) => f.id === s.font) ? (s.font as string) : DEFAULT_STYLE.font;
  const badge = (PREMIUM_BADGES as readonly string[]).includes(s.badge as string) ? (s.badge as string) : DEFAULT_STYLE.badge;
  const bubble = PREMIUM_BUBBLES.some((b) => b.id === s.bubble) ? (s.bubble as string) : DEFAULT_STYLE.bubble;
  return { font, badge, bubble };
}

/** Apply a style change: unknown values are ignored (the current choice stays) */
export function mergeStyle(cur: PremiumStyle, patch: Partial<PremiumStyle>): PremiumStyle {
  const ok = cleanStyle({ ...cur, ...patch });
  return {
    font: patch.font !== undefined && ok.font === patch.font ? patch.font : cur.font,
    badge: patch.badge !== undefined && ok.badge === patch.badge ? patch.badge : cur.badge,
    bubble: patch.bubble !== undefined && ok.bubble === patch.bubble ? patch.bubble : cur.bubble,
  };
}

export const bubbleOf = (id: string) => PREMIUM_BUBBLES.find((b) => b.id === id) ?? PREMIUM_BUBBLES[0];

export const PREMIUM_PERKS = [
  { icon: "✨", title: "Animatsiyali stikerlar", text: "Telegramdagidek jonli premium stikerlar va katta animatsiyali emoji" },
  { icon: "🖋️", title: "Chiroyli ism", text: "Chatda ismingiz 8 xil shriftdan birida, rangli gradient bilan" },
  { icon: "👑", title: "Premium belgisi", text: "Ismingiz yonida o'zingiz tanlagan belgi — xohlagan payt almashtiring" },
  { icon: "🎨", title: "Rangli xabarlar", text: "Xabarlaringiz o'zingiz tanlagan rangli pufakchada" },
  { icon: "🎞️", title: "Premium GIFlar", text: "Personajingiz bilan maxsus GIFlar (raqs, salyut, g'alaba)" },
] as const;
