// "Yashil zona": har 3 savoldan keyin maydonda hamma o'quvchining roboti paydo bo'ladi.
// 1-to'lqin — bitta katta umumiy zona (hamma sig'adi). Keyingi to'lqinlarda 2–3 ta kichik zona yonadi va har birida
// joy soni bor (masalan 12 kishi: 6+6, 5+5+2 yoki 6+3+3 — jami tirik robotlar soniga teng). Zonaga birinchi kirganlar
// joy oladi; zona to'lsa, kech kelgan robot boshqa zonaga yugurishi kerak. Vaqt tugaganda joysiz qolgan robot o'chadi.
// Maydondagi ⭐ yulduzlar ochko beradi, lekin zonalardan uzoqda. To'g'ri javoblar robotni tezlashtiradi.
// Bu fayl brauzer, server va real vaqt xonasi (Cloudflare) uchun umumiy — sof funksiyalar.

import { seeded } from "./galaxy";

export const ZONE_EVERY = 3;
/** Maydon o'lchami (birlik) */
export const FIELD = { w: 100, h: 62 } as const;
export const ROBOT_R = 1.6;
export const STAR_R = 1.4;
/** To'lqin: zonaga yugurish vaqti va "zona yopildi" — hamma to'xtaydi, natija ko'rsatiladi */
export const WAVE_MS = 8000;
export const LOCK_MS = 2200;
export const ZONE_INTRO_S = 5;
/** HTTP yo'li: to'lqin tugagach shuncha kutib natija hisoblanadi (oxirgi joylashuvlar yetib kelsin) */
export const RESOLVE_DELAY_MS = 700;
/** Real vaqt xonasi: to'lqin tugagach yana shuncha harakat qabul qilinadi (tarmoq kechikishi), keyin natija */
export const ROOM_GRACE_MS = 200;
export const ROOM_RESOLVE_MS = 350;
export const MAX_STARS = 60;
export const STARS_PER_WAVE = 6;

/** Tezlik (birlik/s): asosiy + har to'g'ri javobga (ko'pi bilan 4 ta) */
export function zoneSpeed(correct: number): number {
  return 15 + Math.min(4, Math.max(0, Math.floor(correct))) * 2;
}

export interface ZoneCircle {
  cx: number;
  cy: number;
  r: number;
  /** Joylar soni; 0 — cheklanmagan (umumiy zona) */
  cap: number;
}

/**
 * Tuzoq: "slow" — loy (ichida robot sekin yuradi), "zap" — elektr (yonib-o'chadi; yoniq paytda tekkan robot qotib qoladi).
 * Tuzoqlar zonalar ustida bo'lmaydi, lekin yo'lda — aylanib o'tish kerak.
 */
export interface ZoneTrap {
  id: number;
  kind: "slow" | "zap";
  x: number;
  y: number;
  r: number;
  /** Elektr: yonish fazasi (ms) */
  phase: number;
}

export interface ZoneWave {
  zones: ZoneCircle[];
  /** Umumiy zona (1-to'lqin) — hamma sig'adi */
  shared: boolean;
  stars: { id: number; x: number; y: number }[];
  traps: ZoneTrap[];
}

/** Loyda tezlik ulushi */
export const SLOW_FACTOR = 0.45;
/** Elektr tuzoq: davr va yoniq qismi (ms), tekkanda qotish vaqti */
export const ZAP_PERIOD_MS = 2600;
export const ZAP_ON_MS = 1000;
export const ZAP_STUN_MS = 1200;

/** Elektr tuzoq hozir yoniqmi (to'lqin boshidan beri o'tgan vaqt bo'yicha — hamma bir xil ko'radi) */
export function zapActive(trap: ZoneTrap, sinceWaveStartMs: number): boolean {
  if (trap.kind !== "zap" || sinceWaveStartMs < 0) return false;
  return (sinceWaveStartMs + trap.phase) % ZAP_PERIOD_MS < ZAP_ON_MS;
}

/** Robot shu tuzoq ustidami */
export function onTrap(x: number, y: number, trap: ZoneTrap): boolean {
  return Math.hypot(x - trap.x, y - trap.y) <= trap.r + ROBOT_R * 0.4;
}

export function zoneWaveCount(final: boolean): number {
  return final ? 5 : 3;
}

/**
 * Tirik robotlarni 2–3 guruhga bo'lish: joylar yig'indisi = n, har zonada kamida 1 joy.
 * Ba'zan teng (6+6, 4+4+4), ba'zan notekis (5+5+2, 6+3+3, 7+5). Kattasi oldinda.
 */
export function zoneSplit(n: number, rnd: () => number): number[] {
  const total = Math.max(1, Math.floor(n));
  if (total <= 1) return [1];
  if (total === 2) return [1, 1];
  const k = total < 6 ? 2 : rnd() < 0.5 ? 2 : 3;
  const weights = rnd() < 0.35 ? Array.from({ length: k }, () => 1) : Array.from({ length: k }, () => 0.35 + rnd());
  const sum = weights.reduce((a, b) => a + b, 0);
  const rest = total - k;
  const raw = weights.map((w) => (w / sum) * rest);
  const caps = raw.map((x) => 1 + Math.floor(x));
  let left = total - caps.reduce((a, b) => a + b, 0);
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f);
  for (let j = 0; left > 0; j = (j + 1) % k, left--) caps[order[j].i] += 1;
  return caps.sort((a, b) => b - a);
}

/** Zona radiusi joylar soniga qarab (hammasi sig'adigan), keyingi to'lqinlarda biroz torayadi */
export function zoneRadius(cap: number, wave: number): number {
  const s = Math.sqrt(Math.max(1, cap));
  const shrink = 1 - Math.min(0.15, Math.max(0, wave - 1) * 0.05);
  return Math.min(13, Math.max(2.2 * s + 1.4, (2.6 * s + 2.6) * shrink));
}

/**
 * To'lqin xaritasi urug'dan va shu to'lqin boshidagi tirik robotlar sonidan — hamma bir xil zonalarni ko'radi.
 * 0-to'lqin — bitta umumiy zona; keyingilari — joyli guruh zonalari.
 */
export function zoneWave(seed: number, final: boolean, wave: number, alive: number): ZoneWave {
  const rnd = seeded((Math.imul(seed >>> 0, 31) + (wave + 1) * 0x9e3779b1) >>> 0);
  const zones: ZoneCircle[] = [];
  if (wave <= 0) {
    // Umumiy zona: o'rtadagi robotlardan uzoqroqda — yugurish kerak bo'lsin
    const r = final ? 15 : 16;
    let cx = 0;
    let cy = 0;
    for (let tries = 0; tries < 40; tries++) {
      cx = r + 3 + rnd() * (FIELD.w - 2 * (r + 3));
      cy = r + 3 + rnd() * (FIELD.h - 2 * (r + 3));
      if (Math.hypot(cx - FIELD.w / 2, cy - FIELD.h / 2) > 24) break;
    }
    zones.push({ cx, cy, r, cap: 0 });
  } else {
    for (const cap of zoneSplit(alive, rnd)) {
      const r = zoneRadius(cap, wave);
      let best = { cx: FIELD.w / 2, cy: FIELD.h / 2, d: -Infinity };
      for (let tries = 0; tries < 60; tries++) {
        const cx = r + 3 + rnd() * (FIELD.w - 2 * (r + 3));
        const cy = r + 3 + rnd() * (FIELD.h - 2 * (r + 3));
        // Boshqa zonalardan oraliq (bir-biriga tegmasin, orasida yugurish kerak bo'lsin)
        const gap = zones.length === 0 ? 99 : Math.min(...zones.map((z) => Math.hypot(z.cx - cx, z.cy - cy) - z.r - r));
        if (gap > best.d) best = { cx, cy, d: gap };
        if (gap > 12) break;
      }
      zones.push({ cx: best.cx, cy: best.cy, r, cap });
    }
  }
  const stars: ZoneWave["stars"] = [];
  for (let k = 0; k < STARS_PER_WAVE; k++) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 25; tries++) {
      x = 4 + rnd() * (FIELD.w - 8);
      y = 4 + rnd() * (FIELD.h - 8);
      if (zones.every((z) => Math.hypot(x - z.cx, y - z.cy) > z.r + 5)) break;
    }
    stars.push({ id: Math.max(0, wave) * 10 + k, x, y });
  }
  // Tuzoqlar: zonalar ustida emas, maydon o'rtasidan (boshlanish joyi) uzoqroq; to'lqin sayin ko'payadi
  const traps: ZoneTrap[] = [];
  const nTraps = Math.min(7, 3 + Math.max(0, wave));
  for (let k = 0; k < nTraps; k++) {
    const kind: ZoneTrap["kind"] = k % 2 === 0 ? "zap" : "slow";
    const r = kind === "slow" ? 4 + rnd() * 2.5 : 2.6 + rnd() * 1.2;
    let x = 0;
    let y = 0;
    let okSpot = false;
    for (let tries = 0; tries < 40 && !okSpot; tries++) {
      x = r + 2 + rnd() * (FIELD.w - 2 * (r + 2));
      y = r + 2 + rnd() * (FIELD.h - 2 * (r + 2));
      okSpot =
        zones.every((z) => Math.hypot(x - z.cx, y - z.cy) > z.r + r + 2.5) &&
        traps.every((t) => Math.hypot(x - t.x, y - t.y) > t.r + r + 3) &&
        (wave > 0 || Math.hypot(x - FIELD.w / 2, y - FIELD.h / 2) > 20);
    }
    if (okSpot) traps.push({ id: Math.max(0, wave) * 10 + k, kind, x, y, r, phase: Math.floor(rnd() * ZAP_PERIOD_MS) });
  }
  return { zones, shared: wave <= 0, stars, traps };
}

/** w-to'lqin boshida tirik robotlar: o'chmaganlar va keyinroq o'chganlar (outWave >= w) */
export function aliveAt(outWaves: Iterable<number>, wave: number): number {
  let n = 0;
  for (const o of outWaves) if (o < 0 || o >= wave) n += 1;
  return n;
}

/** Raund davomiyligi (ms, sanoqsiz) */
export function zoneDurationMs(final: boolean): number {
  return zoneWaveCount(final) * (WAVE_MS + LOCK_MS);
}

/** w-to'lqin yugurish vaqti tugaydigan payt */
export function waveEndAt(startedAt: number, wave: number): number {
  return startedAt + wave * (WAVE_MS + LOCK_MS) + WAVE_MS;
}

/** Hozir qaysi to'lqin va bosqich: -1 — boshlanmagan; lock — zona yopilgan (to'xtash vaqti) */
export function zonePhase(startedAt: number, now: number, waves: number): { wave: number; lock: boolean; waveEndsAt: number; waveStartedAt: number; done: boolean } {
  const span = WAVE_MS + LOCK_MS;
  if (now < startedAt) return { wave: -1, lock: false, waveEndsAt: startedAt + WAVE_MS, waveStartedAt: startedAt, done: false };
  const w = Math.floor((now - startedAt) / span);
  if (w >= waves) return { wave: waves - 1, lock: true, waveEndsAt: waveEndAt(startedAt, waves - 1), waveStartedAt: startedAt + (waves - 1) * span, done: true };
  const start = startedAt + w * span;
  return { wave: w, lock: now >= start + WAVE_MS, waveEndsAt: start + WAVE_MS, waveStartedAt: start, done: false };
}

/** Robot shu zonadami (markazi zona ichida — chetiga tegib turgani ham hisoblanadi) */
export function insideCircle(x: number, y: number, z: ZoneCircle): boolean {
  return Math.hypot(x - z.cx, y - z.cy) <= z.r + ROBOT_R * 0.5;
}

/** Robot turgan zona raqami (-1 — hech qaysi) */
export function zoneIndexAt(x: number, y: number, wave: ZoneWave): number {
  let best = -1;
  let bestD = Infinity;
  wave.zones.forEach((z, i) => {
    const d = Math.hypot(x - z.cx, y - z.cy) - z.r;
    if (insideCircle(x, y, z) && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** Joy da'vosi: qaysi to'lqinda, qaysi zonaga, qachon kirgan (birinchi kirgan — birinchi joy oladi) */
export interface ZoneSeat {
  wave: number;
  zone: number;
  at: number;
}

export const NO_SEAT: ZoneSeat = { wave: -1, zone: -1, at: 0 };

/** Yangi joyda turib — da'voni yangilash (boshqa zonaga o'tsa yoki chiqib ketsa — navbat yo'qoladi) */
export function claimSeat(prev: ZoneSeat | null | undefined, wave: number, zone: number, now: number): ZoneSeat {
  const p = prev ?? NO_SEAT;
  if (zone < 0) return p.wave === wave && p.zone >= 0 ? { wave, zone: -1, at: 0 } : p;
  if (p.wave === wave && p.zone === zone) return p;
  return { wave, zone, at: now };
}

export interface SeatInput {
  id: string;
  x: number;
  y: number;
  out: boolean;
  seat?: ZoneSeat | null;
}

/**
 * Kim qaysi zonada joy olgan: zona ichidagilar kirgan vaqti bo'yicha navbatda, birinchi `cap` tasi — joyli.
 * Qaytaradi: id → { zone, ok } (zona ichida emaslar ro'yxatda yo'q).
 */
export function zoneSeats(wave: number, layout: ZoneWave, players: SeatInput[]): Map<string, { zone: number; ok: boolean }> {
  const res = new Map<string, { zone: number; ok: boolean }>();
  const queues = layout.zones.map(() => [] as { id: string; at: number }[]);
  for (const p of players) {
    if (p.out) continue;
    const zi = zoneIndexAt(p.x, p.y, layout);
    if (zi < 0) continue;
    const s = p.seat;
    queues[zi].push({ id: p.id, at: s && s.wave === wave && s.zone === zi ? s.at : Number.MAX_SAFE_INTEGER });
  }
  queues.forEach((q, zi) => {
    q.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const cap = layout.zones[zi].cap;
    q.forEach((e, k) => res.set(e.id, { zone: zi, ok: cap <= 0 || k < cap }));
  });
  return res;
}

/** To'lqin natijasi: joysiz qolganlar (zonadan tashqarida yoki zona to'lgan) o'chadi */
export function zoneEliminated(wave: number, layout: ZoneWave, players: SeatInput[]): string[] {
  const seats = zoneSeats(wave, layout, players);
  return players.filter((p) => !p.out && !seats.get(p.id)?.ok).map((p) => p.id);
}

/** Ochko: har omon qolingan to'lqin 150, oxirigacha qolganga +300, har yulduz 30; final ikki baravar */
export function zonePoints(survived: number, waves: number, stars: number, final: boolean): number {
  const s = Math.max(0, Math.min(waves, survived));
  const total = s * 150 + (s >= waves ? 300 : 0) + Math.min(MAX_STARS, Math.max(0, Math.floor(stars))) * 30;
  return final ? total * 2 : total;
}

/** Robot ranglari */
export const ROBOT_COLORS = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#a78bfa", "#fb7185", "#34d399", "#60a5fa", "#f97316", "#e879f9"];

/**
 * Ekrandagi robot holati (HTTP javobi va xona kadri uchun bir xil): [id, ism, x, y, rang, outWave+1 (0 — tirik), joy]
 * joy: 0 — zonada emas, z+1 — z-zonada joyli, -(z+1) — z-zonada, lekin joy yetmadi
 */
export type ZonePeer = [string, string, number, number, number, number, number];

export function seatCode(s: { zone: number; ok: boolean } | undefined): number {
  if (!s) return 0;
  return s.ok ? s.zone + 1 : -(s.zone + 1);
}

/** Boshlanish joyi: maydon o'rtasida aylana bo'ylab */
export function zoneSpawn(i: number, n: number): { x: number; y: number } {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  const rr = Math.min(18, 6 + n * 0.6);
  return { x: FIELD.w / 2 + Math.cos(a) * rr, y: FIELD.h / 2 + Math.sin(a) * rr * 0.7 };
}

/** Bir qadamdagi eng uzoq yurish (tezlik tekshiruvi): oxirgi qabul qilingandan beri */
export function maxStep(speed: number, dtMs: number): number {
  return speed * (Math.max(0, Math.min(1500, dtMs)) / 1000) * 1.35 + 2;
}

/** Tezlik bo'yicha cheklangan yangi joy */
export function cappedMove(x: number, y: number, wantX: number, wantY: number, limit: number): { x: number; y: number } {
  const tx = Math.min(FIELD.w, Math.max(0, wantX));
  const ty = Math.min(FIELD.h, Math.max(0, wantY));
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  const k = d > limit ? limit / d : 1;
  return { x: Math.round((x + dx * k) * 100) / 100, y: Math.round((y + dy * k) * 100) / 100 };
}
