// "Galaktika poygasi 3D": har 3 savoldan keyin kosmik poyga, oxirida final. Har o'quvchi o'z kemasini boshqaradi:
// asteroidlardan qochadi, kristall yig'adi, oltin halqalardan o'tib tezlashadi, turbo yoqadi.
// Trassa urug'dan (seed) yasaladi — sinfdagi hamma bir xil trassada uchadi, shuning uchun poyga adolatli.
// Bu fayl brauzer va server uchun umumiy (sof funksiyalar).

/** Har nechta savoldan keyin */
export const GALAXY_EVERY = 3;
export const GALAXY_SECONDS = 40;
export const GALAXY_FINAL_SECONDS = 60;
/** Boshlanishdan oldingi sanoq (soniya) */
export const GALAXY_INTRO_S = 5;

/** Tezliklar, m/s */
export const SPEED = { base: 26, max: 44, turbo: 24, ring: 14, stunned: 8 } as const;
/** Turbo davomiyligi va asteroidga urilgandagi sekinlashish (ms) */
export const TURBO_MS = 2200;
export const STUN_MS = 900;
export const RING_MS = 1200;
/** Server tekshiruvi: bundan tez uchib bo'lmaydi (turbo + halqa bilan ham) */
export const MAX_SPEED_CHECK = 90;
export const MAX_ORBS = 120;

/** Trassa kengligi: x ∈ [-1, 1] (dunyoda ±HALF_WIDTH metr) */
export const HALF_WIDTH = 6;
/** Server javobidagi boshqa kema: [id, ism, masofa, x, kema rangi] — ixcham */
export type GalaxyPeer = [string, string, number, number, number];

export type TrackKind = "rock" | "orb" | "ring";
export interface TrackItem {
  id: number;
  /** Startdan masofa (m) */
  z: number;
  x: number;
  kind: TrackKind;
  /** Asteroid kattaligi (0.8–1.4) */
  size: number;
}

/** Urug'li tasodif (mulberry32) — server va har bir brauzerda bir xil ketma-ketlik */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Matndan urug' (o'yin ID + raund) */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Trassa: 60 m dan keyin har 14–22 m da to'siq qatori (1–3 asteroid, doim o'tish joyi qoladi),
 * oralarida kristallar zanjiri, ba'zan oltin halqa. Uzoqlashgani sari qatorlar zichlashadi.
 */
export function galaxyTrack(seed: number, length = 4000): TrackItem[] {
  const rnd = seeded(seed);
  const items: TrackItem[] = [];
  let id = 0;
  let z = 60;
  while (z < length) {
    const hard = Math.min(1, z / 1800);
    const rocks = 1 + Math.floor(rnd() * (hard > 0.5 ? 3 : 2));
    // O'tish joyi: shu x atrofida asteroid bo'lmaydi
    const gap = rnd() * 1.6 - 0.8;
    const used: number[] = [];
    for (let k = 0; k < rocks; k++) {
      let x = 0;
      for (let tries = 0; tries < 12; tries++) {
        x = rnd() * 1.9 - 0.95;
        if (Math.abs(x - gap) > 0.38 && used.every((u) => Math.abs(u - x) > 0.3)) break;
      }
      if (Math.abs(x - gap) <= 0.38) continue;
      used.push(x);
      items.push({ id: id++, z: z + rnd() * 3, x, kind: "rock", size: 0.8 + rnd() * 0.6 });
    }
    const step = 14 + rnd() * (8 - hard * 4);
    // Kristallar: o'tish joyidan keyingi qatorgacha egri chiziq
    if (rnd() < 0.75) {
      const from = gap;
      const to = Math.max(-0.9, Math.min(0.9, gap + (rnd() - 0.5) * 0.9));
      const n = 3 + Math.floor(rnd() * 3);
      for (let k = 1; k <= n; k++) {
        items.push({ id: id++, z: z + (step * k) / (n + 1), x: from + ((to - from) * k) / (n + 1), kind: "orb", size: 1 });
      }
    } else if (rnd() < 0.6) {
      items.push({ id: id++, z: z + step / 2, x: rnd() * 1.4 - 0.7, kind: "ring", size: 1 });
    }
    z += step;
  }
  return items.sort((a, b) => a.z - b.z);
}

/** Turbo zaryadlari: to'g'ri javoblar ko'p bo'lsa — ko'proq (1–4, finalda 2–5) */
export function galaxyTurbo(correct: number, final: boolean): number {
  const c = Math.max(0, Math.floor(correct));
  return final ? Math.min(5, 2 + Math.floor(c / 3)) : Math.min(4, 1 + c);
}

/** O'rin ochkosi: 1–3 o'ringa 700/500/400, qolganlar kamayib boradi (100 dan kam emas); har kristall +15 */
export function galaxyPoints(place: number, orbs: number, final: boolean): number {
  const byPlace = place === 1 ? 700 : place === 2 ? 500 : place === 3 ? 400 : Math.max(100, 350 - (place - 4) * 40);
  const total = byPlace + Math.min(MAX_ORBS, Math.max(0, Math.floor(orbs))) * 15;
  return final ? total * 2 : total;
}

export interface GalaxyRow {
  id: string;
  d: number;
  orbs: number;
}

/** Poyga tartibi: uzoqroq uchgan, teng bo'lsa ko'proq kristall yig'gan */
export function galaxyStandings<T extends GalaxyRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.d - a.d || b.orbs - a.orbs);
}

/** Kemalar ranglari (o'yinchi tartibi bo'yicha) */
export const SHIP_COLORS = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#a78bfa", "#fb7185", "#34d399", "#60a5fa", "#f97316", "#e879f9"];
