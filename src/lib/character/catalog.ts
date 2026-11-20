// O'quvchi personaji: qismlar katalogi, daraja talablari, coin narxlari va "kuch" upgrade'i.
// Boshida hammada oddiy personaj (bepul qismlar). Daraja oshgani sari personaj o'zi chiroyliroq bo'ladi
// (tagidagi supa materiali, nur, aura) va yangi qismlar ochiladi; ba'zilari coin evaziga sotib olinadi.
// Bu fayl brauzer va server uchun umumiy (sof funksiyalar).

export const CHAR_SLOTS = ["skin", "hair", "eyes", "mouth", "head", "outfit", "back", "hand", "pet", "costume"] as const;
export type CharSlot = (typeof CHAR_SLOTS)[number];

export interface CharItem {
  slot: CharSlot;
  id: string;
  name: string;
  /** Ochiladigan daraja */
  level: number;
  /** Coin narxi; 0 — darajaga yetganda bepul */
  price: number;
}

export const SLOT_LABELS: Record<CharSlot, string> = {
  skin: "Teri rangi",
  hair: "Soch",
  eyes: "Ko'zlar",
  mouth: "Og'iz",
  head: "Bosh kiyim",
  outfit: "Kiyim",
  back: "Orqada",
  hand: "Qo'lda",
  pet: "Hamroh",
  costume: "Kostyum",
};

const I = (slot: CharSlot, id: string, name: string, level: number, price: number): CharItem => ({ slot, id, name, level, price });

export const CHAR_ITEMS: CharItem[] = [
  // Teri
  I("skin", "peach", "Shaftoli", 1, 0),
  I("skin", "tan", "Bug'doy", 1, 0),
  I("skin", "brown", "Qo'ng'ir", 1, 0),
  I("skin", "cocoa", "Kakao", 1, 0),
  I("skin", "mint", "Yalpiz", 2, 2),
  I("skin", "sky", "Osmon", 3, 5),
  I("skin", "lilac", "Binafsha", 4, 5),
  I("skin", "gold", "Oltin", 8, 12),
  I("skin", "galaxy", "Koinot", 10, 22),
  // Soch
  I("hair", "short", "Qisqa", 1, 0),
  I("hair", "side", "Yon tarash", 1, 0),
  I("hair", "long", "Uzun", 1, 0),
  I("hair", "bun", "Tugun", 1, 0),
  I("hair", "spiky", "Tikanli", 2, 2),
  I("hair", "curly", "Jingalak", 2, 2),
  I("hair", "mohawk", "Irokez", 4, 5),
  I("hair", "fire", "Olov soch", 8, 18),
  // Ko'zlar
  I("eyes", "dot", "Oddiy", 1, 0),
  I("eyes", "happy", "Quvnoq", 1, 0),
  I("eyes", "wink", "Ko'z qisish", 2, 2),
  I("eyes", "shades", "Qora ko'zoynak", 3, 5),
  I("eyes", "star", "Yulduz ko'z", 5, 8),
  I("eyes", "visor", "Kiber vizor", 6, 12),
  I("eyes", "fire", "Olovli nigoh", 9, 18),
  // Og'iz
  I("mouth", "smile", "Tabassum", 1, 0),
  I("mouth", "grin", "Kulgu", 1, 0),
  I("mouth", "open", "Hayrat", 2, 2),
  I("mouth", "tongue", "Til", 2, 2),
  I("mouth", "smirk", "Ayyor", 3, 2),
  I("mouth", "mask", "Ninja niqobi", 5, 8),
  // Bosh kiyim
  I("head", "none", "Yo'q", 1, 0),
  I("head", "cap", "Kepka", 2, 2),
  I("head", "beanie", "Do'ppi", 2, 2),
  I("head", "headphones", "Quloqchin", 3, 5),
  I("head", "band", "Ninja bog'ich", 4, 8),
  I("head", "helmet", "Ritsar dubulg'asi", 5, 12),
  I("head", "wizard", "Sehrgar qalpog'i", 6, 12),
  I("head", "astro", "Kosmonavt dubulg'asi", 7, 18),
  I("head", "crown", "Toj", 9, 22),
  I("head", "halo", "Nur halqa", 10, 26),
  // Kiyim
  I("outfit", "tee", "Futbolka", 1, 0),
  I("outfit", "hoodie", "Xudi", 2, 5),
  I("outfit", "school", "Maktab formasi", 3, 5),
  I("outfit", "ninja", "Ninja kiyimi", 4, 8),
  I("outfit", "armor", "Ritsar sovuti", 5, 12),
  I("outfit", "space", "Skafandr", 7, 18),
  I("outfit", "hero", "Superqahramon", 8, 22),
  I("outfit", "royal", "Shoh libosi", 10, 26),
  // Orqada
  I("back", "none", "Yo'q", 1, 0),
  I("back", "backpack", "Ryukzak", 2, 2),
  I("back", "cape", "Plash", 4, 8),
  I("back", "jetpack", "Reaktiv ranets", 6, 12),
  I("back", "wings", "Farishta qanotlari", 8, 22),
  I("back", "dragon", "Ajdar qanotlari", 10, 26),
  // Qo'lda
  I("hand", "none", "Yo'q", 1, 0),
  I("hand", "pencil", "Qalam", 1, 0),
  I("hand", "book", "Kitob", 2, 2),
  I("hand", "laptop", "Noutbuk", 4, 8),
  I("hand", "sword", "Qilich", 5, 12),
  I("hand", "wand", "Sehrli tayoqcha", 7, 18),
  I("hand", "trophy", "Kubok", 9, 22),
  // Hamroh
  I("pet", "none", "Yo'q", 1, 0),
  I("pet", "chick", "Jo'ja", 3, 5),
  I("pet", "cat", "Mushuk", 5, 12),
  I("pet", "drone", "Dron", 6, 12),
  I("pet", "dragon", "Kichik ajdar", 10, 30),
  // Qahramon kostyumlari (original): kiyim, bosh kiyim va orqadagi narsa o'rniga butun obraz
  I("costume", "none", "Yo'q", 1, 0),
  I("costume", "cat", "Kosmik mushuk", 2, 50),
  I("costume", "penguin", "Pingvin", 2, 50),
  I("costume", "dino", "Dinozavr", 3, 70),
  I("costume", "dragon", "Ajdar xudi", 3, 70),
  I("costume", "wind", "Shamol yuguruvchi", 4, 70),
  I("costume", "pirate", "Qaroqchi kapitan", 4, 90),
  I("costume", "forest", "O'rmon devi", 5, 90),
  I("costume", "night", "Tungi qo'riqchi", 5, 110),
  I("costume", "ice", "Muz shahzodasi", 6, 130),
  I("costume", "cyber", "Kiber zirh", 7, 150),
  // Original qahramonlar — 50 coindan
  I("costume", "bee", "Asalari", 1, 50),
  I("costume", "hero", "Super qahramon", 2, 60),
  I("costume", "shadow", "Soya ninja", 3, 80),
  I("costume", "astronaut", "Kosmonavt", 3, 90),
  I("costume", "knight", "Ritsar", 4, 100),
  I("costume", "robot", "Temir robot", 5, 120),
  I("costume", "wizard", "Sehrgar", 6, 140),
];

const BY_KEY = new Map(CHAR_ITEMS.map((it) => [`${it.slot}:${it.id}`, it]));

export function charItem(slot: CharSlot, id: string): CharItem | null {
  return BY_KEY.get(`${slot}:${id}`) ?? null;
}

export const itemKey = (it: Pick<CharItem, "slot" | "id">) => `${it.slot}:${it.id}`;

/** Personaj ko'rinishi (har qismning id si) va kuch darajasi */
export type CharLook = Record<CharSlot, string> & { power: number };

export const DEFAULT_LOOK: CharLook = {
  skin: "peach",
  hair: "short",
  eyes: "dot",
  mouth: "smile",
  head: "none",
  outfit: "tee",
  back: "none",
  hand: "none",
  pet: "none",
  costume: "none",
  power: 0,
};

/** Kiyim asosiy ranglari (futbolka va xudi uchun tanlanadi) */
export const OUTFIT_COLORS = ["#14b8a6", "#3b82f6", "#f43f5e", "#f59e0b", "#8b5cf6", "#22c55e", "#0f172a", "#ec4899"] as const;

/** Kuch upgrade: har bosqich — ko'proq uchqun, yorqinroq nur. Narx va ochiladigan daraja */
export const POWER_STEPS = [
  { level: 1, price: 50 },
  { level: 3, price: 100 },
  { level: 5, price: 200 },
  { level: 7, price: 350 },
  { level: 9, price: 500 },
] as const;
export const MAX_POWER = POWER_STEPS.length;

/**
 * Narsa egalikda: sotib olingan yoki sovg'a qilingan (ro'yxatda) — darajadan qat'i nazar;
 * bepuli — darajasi yetganda.
 */
export function hasItem(it: CharItem, owned: readonly string[], level: number): boolean {
  if (owned.includes(itemKey(it))) return true;
  return it.price === 0 && level >= it.level;
}

/**
 * Jonli o'yin sovg'asi uchun buyum: hali egalikda bo'lmagan pullik buyumlardan, arzonrog'i tez-tez tushadi
 * (yuqori darajadagi buyum ham chiqishi mumkin — sovg'a daraja talabisiz ochiladi). Hammasi bor bo'lsa — null.
 */
export function pickGiftItem(owned: readonly string[], rng: number = Math.random()): CharItem | null {
  const pool = CHAR_ITEMS.filter((it) => it.price > 0 && !owned.includes(itemKey(it)));
  if (pool.length === 0) return null;
  const weights = pool.map((it) => 100 / it.price);
  const total = weights.reduce((a, b) => a + b, 0);
  let x = Math.min(Math.max(rng, 0), 0.999999) * total;
  for (let i = 0; i < pool.length; i++) {
    if (x < weights[i]) return pool[i];
    x -= weights[i];
  }
  return pool[pool.length - 1];
}

/**
 * Saqlanadigan ko'rinishni tozalash: noma'lum yoki ega bo'linmagan qism — standartiga qaytadi.
 * Rang (kiyim) va kuch darajasi ham chegaralanadi.
 */
export function cleanLook(raw: unknown, owned: readonly string[], level: number, ownedPower: number, outfitColor?: unknown): CharLook & { color: number } {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const look = { ...DEFAULT_LOOK } as CharLook;
  for (const slot of CHAR_SLOTS) {
    const id = typeof src[slot] === "string" ? (src[slot] as string) : DEFAULT_LOOK[slot];
    const it = charItem(slot, id);
    look[slot] = it && hasItem(it, owned, level) ? id : DEFAULT_LOOK[slot];
  }
  const p = Math.floor(Number(src.power));
  look.power = Number.isFinite(p) ? Math.max(0, Math.min(ownedPower, p)) : ownedPower;
  const c = Math.floor(Number(outfitColor ?? src.color));
  return { ...look, color: Number.isFinite(c) && c >= 0 && c < OUTFIT_COLORS.length ? c : 0 };
}

/** O'yinlarda ishlatiladigan ixcham ko'rinish (daraja ham — supa va aura shunga qarab) */
export interface GameLook extends CharLook {
  color: number;
  level: number;
}

export function gameLook(look: Partial<CharLook & { color: number }> | null | undefined, level: number): GameLook {
  const base = { ...DEFAULT_LOOK, color: 0, ...(look ?? {}) };
  return { ...base, level: Math.max(1, Math.min(10, Math.floor(level) || 1)) };
}

/** Darajaga qarab supa materiali (Temir → Koinot): rang va yaltiroqlik */
export const TIER_COLORS = [
  { base: "#64748b", light: "#94a3b8", glow: "rgba(148,163,184,0)" },
  { base: "#b45309", light: "#d97706", glow: "rgba(217,119,6,0)" },
  { base: "#a16207", light: "#ca8a04", glow: "rgba(202,138,4,0.15)" },
  { base: "#94a3b8", light: "#e2e8f0", glow: "rgba(226,232,240,0.25)" },
  { base: "#ca8a04", light: "#fde047", glow: "rgba(253,224,71,0.35)" },
  { base: "#0891b2", light: "#a5f3fc", glow: "rgba(165,243,252,0.4)" },
  { base: "#059669", light: "#6ee7b7", glow: "rgba(110,231,183,0.45)" },
  { base: "#be123c", light: "#fda4af", glow: "rgba(253,164,175,0.5)" },
  { base: "#2563eb", light: "#bfdbfe", glow: "rgba(191,219,254,0.55)" },
  { base: "#7c3aed", light: "#f0abfc", glow: "rgba(240,171,252,0.6)" },
] as const;

export function tierOf(level: number) {
  return TIER_COLORS[Math.max(0, Math.min(TIER_COLORS.length - 1, Math.floor(level) - 1))];
}

/** Supa materiali nomi (daraja emblemalari bilan bir xil) */
export const LEVEL_TIER_NAMES = ["Temir", "Mis", "Bronza", "Kumush", "Oltin", "Platina", "Zumrad", "Yoqut", "Olmos", "Koinot"] as const;
