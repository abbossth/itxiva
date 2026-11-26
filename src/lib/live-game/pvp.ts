// "Kiber jang" — jonli o'yin oxiridagi hamma hammaga qarshi otishma (yuqoridan ko'rinish, original dizayn).
// Har kim o'z qurilmasida harakatlanadi va otadi; o'q tekkanini otgan o'yinchi aniqlaydi, jonni server ayiradi.
// Bu fayl sof: server va brauzer, testlar shu yerdan foydalanadi.

import { DEFAULT_MAP, type ArenaMap } from "./pvp-maps";
export { ARENA_MAPS, DEFAULT_MAP, MAP_IDS, MAP_PACKS, PAD_BOOST, isMapId, mapOf, packOf, pickMap, type ArenaMap, type MapId, type MapPack } from "./pvp-maps";

/** Klassik xarita o'lchami (eski chaqiruvlar uchun). Har jang o'z xaritasidan foydalanadi: `map.w`, `map.h` */
export const MAP_W = DEFAULT_MAP.w;
export const MAP_H = DEFAULT_MAP.h;
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

/** Klassik xarita qismlari (eski chaqiruvlar uchun) */
export const PVP_WALLS: Rect[] = DEFAULT_MAP.walls;
export const BUSHES: Rect[] = DEFAULT_MAP.bushes;
export const TELEPORTS = DEFAULT_MAP.teleports;
export const TELEPORT_R = 34;
export const SPAWNS = DEFAULT_MAP.spawns;

// ---- Jamoaviy arena: jamoadoshlar bir-biriga o'q tekkiza olmaydi, har jamoa o'z burchagidan chiqadi ----

/** Jamoa ranglari (TEAM_NAMES tartibida: Qizillar, Ko'klar, Sariqlar, Yashillar) */
export const TEAM_COLORS = ["#f43f5e", "#3b82f6", "#facc15", "#22c55e"];
export const teamColor = (team: number | null | undefined) => (typeof team === "number" && team >= 0 ? TEAM_COLORS[team % TEAM_COLORS.length] : null);
/** Ikkalasi bitta jamoada (individual jangda — hech qachon) */
export const sameTeam = (a: number | null | undefined, b: number | null | undefined) => typeof a === "number" && a >= 0 && a === b;

/** Jamoa a'zosining paydo bo'lish joyi: o'z burchagida (xarita bazasi), bir-biriga yopishmasdan */
export function teamSpawn(team: number, i: number, map: ArenaMap = DEFAULT_MAP): { x: number; y: number } {
  const b = map.bases[team % map.bases.length];
  const dx = b.x < map.w / 2 ? 1 : -1;
  const dy = b.y < map.h / 2 ? 1 : -1;
  const col = i % 4;
  const row = Math.floor(i / 4);
  return resolve(b.x + dx * col * 58, b.y + dy * row * 58, PLAYER_R, map);
}

/** Jamoalar tartibi: ko'proq tirik a'zo, keyin jami jon, keyin yiqitishlar */
export function teamArenaStandings(rows: { team: number; lives: number; out: boolean; kills: number }[]) {
  const by = new Map<number, { team: number; alive: number; lives: number; kills: number; members: number }>();
  for (const r of rows) {
    if (r.team < 0) continue;
    const t = by.get(r.team) ?? { team: r.team, alive: 0, lives: 0, kills: 0, members: 0 };
    t.members++;
    t.kills += r.kills;
    if (!r.out) {
      t.alive++;
      t.lives += Math.max(0, r.lives);
    }
    by.set(r.team, t);
  }
  return [...by.values()].sort((a, b) => b.alive - a.alive || b.lives - a.lives || b.kills - a.kills);
}
/** Emoji-reaksiyalar (o'yinchi bosganda boshqalarga ham ko'rinadi) */
export const EMOTES = ["😂", "👍", "😡", "🔥"];
export const EMOTE_MS = 2500;
/** Sakrash (dash): qisqa tez siljish, qayta tiklanish vaqti */
export const DASH_MS = 170;
export const DASH_SPEED = 3.2;
export const DASH_COOLDOWN_MS = 2500;
/** Jang oldidan xarita uchun ovoz berish (soniya) */
export const MAP_VOTE_S = 15;

/** G'olib jamoaning har a'zosiga */
export const TEAM_WIN_BONUS = 400;

export function spawnPoint(i: number, map: ArenaMap = DEFAULT_MAP): { x: number; y: number } {
  const s = map.spawns[i % map.spawns.length];
  const ring = Math.floor(i / map.spawns.length);
  return resolve(s.x + ring * 46, s.y + ring * 30, PLAYER_R, map);
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
  heart: { label: "+30 HP", icon: "❤", color: "#f43f5e", ms: 0 },
  shield: { label: "Qalqon", icon: "🛡", color: "#38bdf8", ms: 12000 },
  speed: { label: "Tezlik", icon: "⚡", color: "#facc15", ms: 8000 },
  rapid: { label: "Tez otish", icon: "🔥", color: "#fb923c", ms: 8000 },
  triple: { label: "Uchtalik o'q", icon: "✳", color: "#a78bfa", ms: 8000 },
};
export const POWER_KINDS = Object.keys(POWERS) as PowerKind[];
/** Xaritada bir vaqtda ko'pi bilan shuncha sovg'a */
export const MAX_PICKUPS = 6;
// ---- Sog'liq (HP): har o'yinchida 0–100. `lives` maydoni HP sifatida ishlatiladi ----
export const MAX_HP = 100;
/** Eski nom (yurak bilan to'ldirish chegarasi) */
export const MAX_LIVES = MAX_HP;
/** HP sekin tiklanadi: oxirgi zarardan REGEN_DELAY_MS o'tgach har REGEN_EVERY_MS da +1 (yiqilganda — yo'q) */
export const REGEN_DELAY_MS = 5000;
export const REGEN_EVERY_MS = 3000;
/** Tiklanish: qancha HP qo'shiladi va keyingi hisob qayerdan davom etadi */
export function regenStep(p: { lives: number; lastHurt: number; regenAt: number }, now: number, startedAt: number): { add: number; regenAt: number } {
  if (p.lives <= 0 || p.lives >= MAX_HP) return { add: 0, regenAt: now };
  const from = Math.max(p.regenAt, p.lastHurt + REGEN_DELAY_MS, startedAt);
  if (now < from + REGEN_EVERY_MS) return { add: 0, regenAt: from };
  const steps = Math.floor((now - from) / REGEN_EVERY_MS);
  return { add: Math.min(steps, MAX_HP - p.lives), regenAt: from + steps * REGEN_EVERY_MS };
}
/** ❤ sovg'asi qancha HP qaytaradi */
export const HEART_HP = 30;
/** Zona har ZONE_DAMAGE_MS da shuncha HP oladi */
export const ZONE_DAMAGE = 10;
// ---- Jamoaviy jang: yiqilish va qutqarish ----
// HP 10 ga tushsa o'yinchi YIQILADI: sekin sudraladi, ota olmaydi, HP har soniyada 1 tadan kamayadi.
// Jamoadosh yoniga kelib tugmani 5 s bosib tursa — 50 HP bilan turadi. Qutqarilmasa (yoki yana o'q tegsa) — chiqadi.
export const DOWN_HP = 10;
export const BLEED_MS = 1000;
/** Yiqilganning tezligi (oddiy tezlikka nisbatan) */
export const DOWNED_SPEED = 0.35;
export const REVIVE_MS = 5000;
export const REVIVE_R = 90;
export const REVIVE_HP = 50;
/** Bitta o'yinchi ko'pi bilan necha marta qutqariladi (keyingi safar to'g'ridan-to'g'ri chiqadi) */
export const MAX_REVIVES = 2;
/** O'lgan (chiqqan) jamoadoshni ham tiriltirish mumkin: o'lganidan keyin shu vaqt ichida, sekinroq va kamroq HP bilan */
export const REVIVE_DEAD_WINDOW_MS = 30_000;
export const REVIVE_DEAD_MS = 5000;
export const REVIVE_DEAD_HP = 30;
/** O'lgan jamoadoshni hali tiriltirsa bo'ladimi */
export function revivableDead(p: { out: boolean; outAt?: number | null; revives?: number; team?: number }, now: number): boolean {
  return p.out && (p.team ?? -1) >= 0 && (p.revives ?? 0) < MAX_REVIVES && typeof p.outAt === "number" && p.outAt > 0 && now - p.outAt < REVIVE_DEAD_WINDOW_MS;
}
/** Tiriltirgandan keyin qisqa daxlsizlik */
export const REVIVE_GRACE_MS = 1500;

/** Bitta o'q zarari: qurolga qarab (ko'p to'g'ri javob — kuchliroq lazer) */
export function hitDamage(weapon: string | null | undefined): number {
  return weapon === "Lazer-3" ? 20 : weapon === "Lazer-2" ? 18 : 16;
}
/** O'q tekkandan keyin qisqa daxlsizlik (uchtalik o'q bir zumda 3 jon olmasin) */
export const HIT_GRACE_MS = 450;
export const PICKUP_EVERY_MS = 4000;
export const PICKUP_R = 22;

/** Sovg'a paydo bo'ladigan joylar (klassik xarita) */
export const PICKUP_SPOTS = DEFAULT_MAP.pickups;

/** To'g'ri javoblar — ustunlik: kuchliroq va tezroq otadigan lazer. Sog'liq hammada 100 */
export function pvpLoadout(correct: number): { lives: number; cooldown: number; weapon: string } {
  const c = Math.max(0, Math.floor(correct));
  const lives = MAX_HP;
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
export function resolve(x: number, y: number, r = PLAYER_R, map: ArenaMap = DEFAULT_MAP): { x: number; y: number } {
  let p = { x: Math.max(r, Math.min(map.w - r, x)), y: Math.max(r, Math.min(map.h - r, y)) };
  for (const w of map.walls) {
    const c = collideRect(p.x, p.y, r, w);
    if (c) p = c;
  }
  return p;
}

export const inRect = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const inWall = (x: number, y: number, map: ArenaMap = DEFAULT_MAP) => map.walls.some((w) => inRect(x, y, w));
export const inBush = (x: number, y: number, map: ArenaMap = DEFAULT_MAP) => map.bushes.some((b) => inRect(x, y, b));
export const onPad = (x: number, y: number, map: ArenaMap = DEFAULT_MAP) => map.pads.some((b) => inRect(x, y, b));

/** Teleportga kirdimi: chiqish nuqtasi (bir oz yonida, qayta kirib qolmaslik uchun) */
export function teleportFrom(x: number, y: number, dirX: number, dirY: number, map: ArenaMap = DEFAULT_MAP): { x: number; y: number } | null {
  for (const t of map.teleports) {
    for (const [from, to] of [
      [t.a, t.b],
      [t.b, t.a],
    ] as const) {
      if ((x - from.x) ** 2 + (y - from.y) ** 2 < TELEPORT_R ** 2) {
        const len = Math.hypot(dirX, dirY) || 1;
        return resolve(to.x + (dirX / len) * (TELEPORT_R + PLAYER_R + 8), to.y + (dirY / len) * (TELEPORT_R + PLAYER_R + 8), PLAYER_R, map);
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
export function stepShots(
  shots: Shot[],
  dt: number,
  targets: { id: string; x: number; y: number }[],
  /** Jamoadosh: o'q uning ustidan o'tib ketadi */
  ally?: (owner: string, target: string) => boolean,
  map: ArenaMap = DEFAULT_MAP
): { shots: Shot[]; hits: ShotHit[]; walls: { x: number; y: number }[] } {
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
      if (s.x < 0 || s.y < 0 || s.x > map.w || s.y > map.h || inWall(s.x, s.y, map)) {
        alive = false;
        walls.push({ x: s.x, y: s.y });
      } else if (s.dist > BULLET_RANGE) alive = false;
      else {
        for (const t of targets) {
          if (t.id === s.owner || ally?.(s.owner, t.id)) continue;
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
export function freeSpot(taken: { x: number; y: number }[], rng: () => number = Math.random, map: ArenaMap = DEFAULT_MAP): { x: number; y: number } | null {
  const free = map.pickups.filter((s) => !taken.some((t) => Math.abs(t.x - s.x) < 5 && Math.abs(t.y - s.y) < 5));
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

// ---- Toraluvchi zona (PUBG uslubida): xarita o'zgarmaydi, XAVFSIZ DOIRA bosqichma-bosqich torayadi ----
// Doiradan tashqarida har ZONE_DAMAGE_MS da 1 jon ketadi (qalqon himoya qilmaydi) — o'yinchilar chekkada yashirinib
// vaqt cho'za olmaydi. Doira va keyingi doira jang boshlangan vaqtdan aniq hisoblanadi: server, real vaqt xonasi va
// brauzer bir xil natija oladi.

export const ZONE_DAMAGE_MS = 2500;
export const ZONE_FINAL_R = 170;
/** Bosqichlar (jang davomiyligining ulushi): kutish → torayish; k — boshlang'ich radiusning qancha qismi qoladi */
export const ZONE_PHASES = [
  { from: 0.2, to: 0.38, k: 0.62 },
  { from: 0.5, to: 0.66, k: 0.32 },
  { from: 0.76, to: 0.9, k: 0 },
] as const;

export interface ZoneState {
  /** Hozirgi xavfsiz doira */
  x: number;
  y: number;
  r: number;
  /** Keyingi doira (torayish shu yerga boradi); oxirgi bosqichdan keyin — hozirgisi bilan bir xil */
  tx: number;
  ty: number;
  tr: number;
  /** Doira hozir torayapti */
  shrinking: boolean;
  /** Keyingi o'zgarishgacha (torayish boshlanishi yoki tugashi), ms; 0 — boshqa o'zgarmaydi */
  nextMs: number;
}

/** Oddiy aralashtirish (seed → [0,1)) */
function seeded(seed: number): number {
  let h = Math.floor(Math.abs(seed)) % 2147483647 || 1;
  h = (h * 48271) % 2147483647;
  h = (h * 48271) % 2147483647;
  return h / 2147483647;
}

/** Zonaning boshlang'ich (butun xarita) va oxirgi doirasi */
export function zonePlan(map: ArenaMap, seed: number) {
  const cx = map.w / 2;
  const cy = map.h / 2;
  const r0 = Math.hypot(map.w, map.h) / 2 + PLAYER_R * 2;
  // Oxirgi doira markazi — ochiq joylardan biri (sovg'a nuqtalari devorlarda emas)
  const spots = map.pickups.length ? map.pickups : [{ x: cx, y: cy }];
  const spot = spots[Math.floor(seeded(seed) * spots.length) % spots.length];
  // Doiralar bir-birining ichida bo'lsin: oxirgi markaz boshlang'ich markazdan juda uzoq bo'lmasin
  const maxD = r0 - ZONE_FINAL_R - 40;
  let fx = spot.x;
  let fy = spot.y;
  const d = Math.hypot(fx - cx, fy - cy);
  if (d > maxD) {
    fx = cx + ((fx - cx) / d) * maxD;
    fy = cy + ((fy - cy) / d) * maxD;
  }
  return { cx, cy, r0, fx, fy };
}

function circleOf(plan: ReturnType<typeof zonePlan>, k: number) {
  // k = 1 — butun xarita, k = 0 — oxirgi doira; markaz radius bilan birga oxirgi nuqtaga siljiydi
  const t = 1 - k;
  return { x: plan.cx + (plan.fx - plan.cx) * t, y: plan.cy + (plan.fy - plan.cy) * t, r: ZONE_FINAL_R + (plan.r0 - ZONE_FINAL_R) * k };
}

export function zoneAt(map: ArenaMap, startedAt: number, endsAt: number, now: number): ZoneState {
  const plan = zonePlan(map, startedAt);
  const dur = Math.max(1, endsAt - startedAt);
  const f = Math.max(0, (now - startedAt) / dur);
  let k = 1;
  for (const ph of ZONE_PHASES) {
    const prevK = k;
    if (f < ph.from) {
      const cur = circleOf(plan, prevK);
      const next = circleOf(plan, ph.k);
      return { ...cur, tx: next.x, ty: next.y, tr: next.r, shrinking: false, nextMs: Math.round((ph.from - f) * dur) };
    }
    if (f < ph.to) {
      const u = (f - ph.from) / (ph.to - ph.from);
      const cur = circleOf(plan, prevK + (ph.k - prevK) * u);
      const next = circleOf(plan, ph.k);
      return { ...cur, tx: next.x, ty: next.y, tr: next.r, shrinking: true, nextMs: Math.round((ph.to - f) * dur) };
    }
    k = ph.k;
  }
  const last = circleOf(plan, k);
  return { ...last, tx: last.x, ty: last.y, tr: last.r, shrinking: false, nextMs: 0 };
}

export const outsideZone = (z: Pick<ZoneState, "x" | "y" | "r">, x: number, y: number) => (x - z.x) ** 2 + (y - z.y) ** 2 > z.r * z.r;

/**
 * Zona zarari: tashqarida birinchi marta — hisob boshlanadi, keyin har ZONE_DAMAGE_MS da 1 jon.
 * `since` — tashqarida bo'lishning boshlanishi yoki oxirgi zarar vaqti (0 — ichkarida).
 */
export function zoneStep(since: number, outside: boolean, now: number): { since: number; damage: boolean } {
  if (!outside) return { since: 0, damage: false };
  if (!since) return { since: now, damage: false };
  if (now - since >= ZONE_DAMAGE_MS) return { since: now, damage: true };
  return { since, damage: false };
}

/** Lentada zona yiqitganda "kim" o'rnida */
export const ZONE_KILLER = "⚡ Zona";
