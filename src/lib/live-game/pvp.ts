// "Kiber jang" — jonli o'yin oxiridagi hamma hammaga qarshi otishma (yuqoridan ko'rinish, original dizayn).
// Har kim o'z qurilmasida harakatlanadi va otadi; o'q tekkanini otgan o'yinchi aniqlaydi, jonni server ayiradi.
// Bu fayl sof: server va brauzer, testlar shu yerdan foydalanadi.

export const MAP_W = 2400;
export const MAP_H = 1400;
export const PVP_SECONDS = 120;
export const PVP_INTRO_S = 6;
/** Boshlanishda o'q tegmaydigan vaqt */
export const SPAWN_SHIELD_MS = 3000;
export const PLAYER_R = 22;
export const BULLET_SPEED = 1100;
export const BULLET_RANGE = 900;
export const BASE_SPEED = 300;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Devorlar va qutilar (o'q o'tmaydi) */
export const PVP_WALLS: Rect[] = [
  // Markaziy "yadro": to'rt tomonida kirish joyi bor
  { x: 1080, y: 560, w: 80, h: 40 },
  { x: 1240, y: 560, w: 80, h: 40 },
  { x: 1080, y: 800, w: 80, h: 40 },
  { x: 1240, y: 800, w: 80, h: 40 },
  { x: 1000, y: 600, w: 40, h: 60 },
  { x: 1000, y: 740, w: 40, h: 60 },
  { x: 1360, y: 600, w: 40, h: 60 },
  { x: 1360, y: 740, w: 40, h: 60 },
  // Burchaklardagi "bazalar"
  { x: 240, y: 240, w: 260, h: 36 },
  { x: 240, y: 276, w: 36, h: 180 },
  { x: 1900, y: 240, w: 260, h: 36 },
  { x: 2124, y: 276, w: 36, h: 180 },
  { x: 240, y: 1124, w: 260, h: 36 },
  { x: 240, y: 944, w: 36, h: 180 },
  { x: 1900, y: 1124, w: 260, h: 36 },
  { x: 2124, y: 944, w: 36, h: 180 },
  // Qutilar
  { x: 700, y: 640, w: 80, h: 80 },
  { x: 1620, y: 640, w: 80, h: 80 },
  { x: 1160, y: 300, w: 80, h: 80 },
  { x: 1160, y: 1020, w: 80, h: 80 },
  { x: 560, y: 420, w: 70, h: 70 },
  { x: 1770, y: 910, w: 70, h: 70 },
  { x: 560, y: 910, w: 70, h: 70 },
  { x: 1770, y: 420, w: 70, h: 70 },
];

/** Butalar: ichidagi o'yinchi boshqalarga deyarli ko'rinmaydi (o'q o'tadi) */
export const BUSHES: Rect[] = [
  { x: 820, y: 220, w: 200, h: 120 },
  { x: 1380, y: 1060, w: 200, h: 120 },
  { x: 120, y: 620, w: 140, h: 160 },
  { x: 2140, y: 620, w: 140, h: 160 },
];

/** Teleport juftliklari: biriga kirsang — ikkinchisidan chiqasan */
export const TELEPORTS: { a: { x: number; y: number }; b: { x: number; y: number }; color: string }[] = [
  { a: { x: 420, y: 700 }, b: { x: 1980, y: 700 }, color: "#22d3ee" },
  { a: { x: 1200, y: 160 }, b: { x: 1200, y: 1240 }, color: "#e879f9" },
];
export const TELEPORT_R = 34;

/** O'yinchilar paydo bo'ladigan joylar: avval burchaklar, keyin chetlar — bir-biridan uzoqroq */
export const SPAWNS = [
  { x: 150, y: 150 },
  { x: 2250, y: 1250 },
  { x: 2250, y: 150 },
  { x: 150, y: 1250 },
  { x: 1200, y: 420 },
  { x: 1200, y: 980 },
  { x: 700, y: 150 },
  { x: 1700, y: 1250 },
  { x: 1700, y: 150 },
  { x: 700, y: 1250 },
  { x: 150, y: 450 },
  { x: 2250, y: 950 },
  { x: 2250, y: 450 },
  { x: 150, y: 950 },
  { x: 860, y: 700 },
  { x: 1540, y: 700 },
];
export function spawnPoint(i: number): { x: number; y: number } {
  const s = SPAWNS[i % SPAWNS.length];
  const ring = Math.floor(i / SPAWNS.length);
  return resolve(s.x + ring * 46, s.y + ring * 30);
}

export const SKINS = [
  { id: "bolt", name: "Chaqmoq", body: "#22d3ee", accent: "#0e7490", shape: "round" },
  { id: "rex", name: "Reks", body: "#a3e635", accent: "#3f6212", shape: "square" },
  { id: "nova", name: "Nova", body: "#f472b6", accent: "#9d174d", shape: "round" },
  { id: "tank", name: "Qal'a", body: "#f59e0b", accent: "#92400e", shape: "hex" },
  { id: "ghost", name: "Arvoh", body: "#e2e8f0", accent: "#475569", shape: "round" },
  { id: "vip", name: "Shoh", body: "#a78bfa", accent: "#5b21b6", shape: "hex" },
] as const;
export type SkinId = (typeof SKINS)[number]["id"];
export const skinOf = (id: string | null | undefined) => SKINS.find((s) => s.id === id) ?? SKINS[0];

export type PowerKind = "heart" | "shield" | "speed" | "rapid" | "triple";
export const POWERS: Record<PowerKind, { label: string; icon: string; color: string; ms: number }> = {
  heart: { label: "+1 jon", icon: "❤", color: "#f43f5e", ms: 0 },
  shield: { label: "Qalqon", icon: "🛡", color: "#38bdf8", ms: 12000 },
  speed: { label: "Tezlik", icon: "⚡", color: "#facc15", ms: 8000 },
  rapid: { label: "Tez otish", icon: "🔥", color: "#fb923c", ms: 8000 },
  triple: { label: "Uchtalik o'q", icon: "✳", color: "#a78bfa", ms: 8000 },
};
export const POWER_KINDS = Object.keys(POWERS) as PowerKind[];
/** Xaritada bir vaqtda ko'pi bilan shuncha sovg'a */
export const MAX_PICKUPS = 6;
/** Yurak bilan ko'pi bilan shuncha jon */
export const MAX_LIVES = 6;
/** O'q tekkandan keyin qisqa daxlsizlik (uchtalik o'q bir zumda 3 jon olmasin) */
export const HIT_GRACE_MS = 450;
export const PICKUP_EVERY_MS = 4000;
export const PICKUP_R = 22;

/** Sovg'a paydo bo'ladigan joylar */
export const PICKUP_SPOTS = [
  { x: 1200, y: 700 },
  { x: 600, y: 700 },
  { x: 1800, y: 700 },
  { x: 1200, y: 460 },
  { x: 1200, y: 940 },
  { x: 380, y: 360 },
  { x: 2020, y: 360 },
  { x: 380, y: 1040 },
  { x: 2020, y: 1040 },
  { x: 900, y: 1000 },
  { x: 1500, y: 400 },
];

/** To'g'ri javoblar — ustunlik: 3+ to'g'ri → +1 jon; ko'p to'g'ri → tezroq otadigan qurol */
export function pvpLoadout(correct: number): { lives: number; cooldown: number; weapon: string } {
  const c = Math.max(0, Math.floor(correct));
  const lives = c >= 3 ? 4 : 3;
  if (c >= 6) return { lives, cooldown: 0.22, weapon: "Lazer-3" };
  if (c >= 3) return { lives, cooldown: 0.28, weapon: "Lazer-2" };
  return { lives, cooldown: 0.36, weapon: "Lazer-1" };
}

/** Bonus: o'ldirish × 150 + tirik qolsa 300 + oxirgi qolgan 500, ko'pi bilan 2000 */
export function pvpBonus(kills: number, survived: boolean, lastStanding: boolean): number {
  return Math.min(2000, Math.max(0, Math.floor(kills)) * 150 + (survived ? 300 : 0) + (lastStanding ? 500 : 0));
}

function collideRect(x: number, y: number, r: number, rect: Rect): { x: number; y: number } | null {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2);
  if (d === 0) {
    const opts = [
      { x: rect.x - r, y, m: x - rect.x },
      { x: rect.x + rect.w + r, y, m: rect.x + rect.w - x },
      { x, y: rect.y - r, m: y - rect.y },
      { x, y: rect.y + rect.h + r, m: rect.y + rect.h - y },
    ].sort((p, q) => p.m - q.m);
    return { x: opts[0].x, y: opts[0].y };
  }
  return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
}

/** Doira devor va chegaralardan tashqariga chiqariladi */
export function resolve(x: number, y: number, r = PLAYER_R): { x: number; y: number } {
  let p = { x: Math.max(r, Math.min(MAP_W - r, x)), y: Math.max(r, Math.min(MAP_H - r, y)) };
  for (const w of PVP_WALLS) {
    const c = collideRect(p.x, p.y, r, w);
    if (c) p = c;
  }
  return p;
}

export const inRect = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const inWall = (x: number, y: number) => PVP_WALLS.some((w) => inRect(x, y, w));
export const inBush = (x: number, y: number) => BUSHES.some((b) => inRect(x, y, b));

/** Teleportga kirdimi: chiqish nuqtasi (bir oz yonida, qayta kirib qolmaslik uchun) */
export function teleportFrom(x: number, y: number, dirX: number, dirY: number): { x: number; y: number } | null {
  for (const t of TELEPORTS) {
    for (const [from, to] of [
      [t.a, t.b],
      [t.b, t.a],
    ] as const) {
      if ((x - from.x) ** 2 + (y - from.y) ** 2 < TELEPORT_R ** 2) {
        const len = Math.hypot(dirX, dirY) || 1;
        return resolve(to.x + (dirX / len) * (TELEPORT_R + PLAYER_R + 8), to.y + (dirY / len) * (TELEPORT_R + PLAYER_R + 8));
      }
    }
  }
  return null;
}

export interface Shot {
  id: number;
  /** Kimniki (o'yinchi id) */
  owner: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
}

/** O'q(lar): uchtalikda — uchta, yelpig'ichsimon */
export function fireShots(owner: string, x: number, y: number, angle: number, triple: boolean, nextId: () => number): Shot[] {
  const angles = triple ? [angle - 0.16, angle, angle + 0.16] : [angle];
  return angles.map((a) => ({
    id: nextId(),
    owner,
    x: x + Math.cos(a) * (PLAYER_R + 8),
    y: y + Math.sin(a) * (PLAYER_R + 8),
    vx: Math.cos(a) * BULLET_SPEED,
    vy: Math.sin(a) * BULLET_SPEED,
    dist: 0,
  }));
}

export interface ShotHit {
  shot: number;
  owner: string;
  target: string;
  x: number;
  y: number;
}

/**
 * O'qlarni suradi: devorga, chegaraga urilgan yoki masofasi tugaganlari o'chadi.
 * O'q egasidan boshqa o'yinchiga tegsa — o'chadi va `hits` ga yoziladi (jonni faqat server ayiradi).
 */
export function stepShots(shots: Shot[], dt: number, targets: { id: string; x: number; y: number }[]): { shots: Shot[]; hits: ShotHit[]; walls: { x: number; y: number }[] } {
  const hits: ShotHit[] = [];
  const walls: { x: number; y: number }[] = [];
  const out: Shot[] = [];
  for (const s of shots) {
    // Tez o'q devordan "sakrab" o'tib ketmasligi uchun kichik qadamlar
    const speed = Math.hypot(s.vx, s.vy);
    const steps = Math.max(1, Math.ceil((speed * dt) / 18));
    let alive = true;
    for (let i = 0; i < steps && alive; i++) {
      s.x += (s.vx * dt) / steps;
      s.y += (s.vy * dt) / steps;
      s.dist += (speed * dt) / steps;
      if (s.x < 0 || s.y < 0 || s.x > MAP_W || s.y > MAP_H || inWall(s.x, s.y)) {
        alive = false;
        walls.push({ x: s.x, y: s.y });
      } else if (s.dist > BULLET_RANGE) alive = false;
      else {
        for (const t of targets) {
          if (t.id === s.owner) continue;
          if ((s.x - t.x) ** 2 + (s.y - t.y) ** 2 <= (PLAYER_R + 4) ** 2) {
            hits.push({ shot: s.id, owner: s.owner, target: t.id, x: s.x, y: s.y });
            alive = false;
            break;
          }
        }
      }
    }
    if (alive) out.push(s);
  }
  return { shots: out, hits, walls };
}

/** Eng yaqin ko'rinib turgan raqib (sensorli ekranda avtomatik nishon) */
export function nearestTarget<T extends { x: number; y: number }>(x: number, y: number, list: T[], maxDist = BULLET_RANGE * 0.85): T | null {
  let best: T | null = null;
  let bd = maxDist * maxDist;
  for (const t of list) {
    const d = (t.x - x) ** 2 + (t.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

/** Sovg'a turi: jon kamroq chiqadi */
const POWER_WEIGHTS: [PowerKind, number][] = [
  ["heart", 2],
  ["shield", 2],
  ["speed", 2],
  ["rapid", 2],
  ["triple", 2],
];
export function rollPower(rng: () => number = Math.random): PowerKind {
  const total = POWER_WEIGHTS.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [k, w] of POWER_WEIGHTS) {
    r -= w;
    if (r < 0) return k;
  }
  return "heart";
}

/** Bo'sh joy: mavjud sovg'alar turmagan nuqta */
export function freeSpot(taken: { x: number; y: number }[], rng: () => number = Math.random): { x: number; y: number } | null {
  const free = PICKUP_SPOTS.filter((s) => !taken.some((t) => Math.abs(t.x - s.x) < 5 && Math.abs(t.y - s.y) < 5));
  if (free.length === 0) return null;
  return free[Math.floor(rng() * free.length)];
}

/** Arenadagi o'rinlar: tirik qolganlar (ko'proq jon) birinchi, keyin kechroq chiqqanlar; teng bo'lsa — ko'p yiqitgan */
export function pvpStandings<T extends { lives: number; out: boolean; outAt?: number | null; kills: number }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      Number(a.out) - Number(b.out) ||
      (a.out ? (b.outAt ?? 0) - (a.outAt ?? 0) : b.lives - a.lives) ||
      b.kills - a.kills
  );
}
