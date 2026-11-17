// "Yashil zona": har 3 savoldan keyin maydonda hamma o'quvchining roboti paydo bo'ladi. Har to'lqinda yashil xavfsiz
// zona yonadi — vaqt tugaguncha unga kirib olish kerak, tashqarida qolgan robot o'chadi (shu raundda tomoshabin).
// To'lqin sayin zona kichrayadi va boshqa joyga ko'chadi. Maydondagi ⭐ yulduzlar ochko beradi, lekin zonadan uzoqda.
// To'g'ri javoblar robotni tezlashtiradi. Bu fayl brauzer va server uchun umumiy (sof funksiyalar).

import { seeded } from "./galaxy";

export const ZONE_EVERY = 3;
/** Maydon o'lchami (birlik) */
export const FIELD = { w: 100, h: 62 } as const;
export const ROBOT_R = 1.6;
export const STAR_R = 1.4;
/** To'lqin: zonaga yugurish vaqti va "zona yopildi" — hamma to'xtaydi, natija hisoblanadi */
export const WAVE_MS = 7000;
export const LOCK_MS = 1800;
export const ZONE_INTRO_S = 5;
/** Server tekshiruvi: to'lqin tugagach shuncha kutib natija hisoblanadi (oxirgi joylashuvlar yetib kelsin) */
export const RESOLVE_DELAY_MS = 700;
export const MAX_STARS = 60;

/** Tezlik (birlik/s): asosiy + har to'g'ri javobga (ko'pi bilan 4 ta) */
export function zoneSpeed(correct: number): number {
  return 15 + Math.min(4, Math.max(0, Math.floor(correct))) * 2;
}

export interface ZoneWave {
  cx: number;
  cy: number;
  r: number;
  stars: { id: number; x: number; y: number }[];
}

const RADII = [17, 13, 10, 8, 6.5];

/** Raund to'lqinlari urug'dan — hamma bir xil zonani ko'radi. Oddiy raund — 3 to'lqin, final — 5 */
export function zoneWaves(seed: number, final: boolean): ZoneWave[] {
  const rnd = seeded(seed);
  const n = final ? 5 : 3;
  const waves: ZoneWave[] = [];
  let prev = { x: FIELD.w / 2, y: FIELD.h / 2 };
  let starId = 0;
  for (let w = 0; w < n; w++) {
    const r = RADII[Math.min(w, RADII.length - 1)];
    // Yangi zona oldingisidan uzoqroqda — yugurish kerak bo'lsin
    let cx = 0;
    let cy = 0;
    for (let tries = 0; tries < 30; tries++) {
      cx = r + 4 + rnd() * (FIELD.w - 2 * (r + 4));
      cy = r + 4 + rnd() * (FIELD.h - 2 * (r + 4));
      if (Math.hypot(cx - prev.x, cy - prev.y) > 28) break;
    }
    prev = { x: cx, y: cy };
    const stars: ZoneWave["stars"] = [];
    for (let k = 0; k < 6; k++) {
      let x = 0;
      let y = 0;
      for (let tries = 0; tries < 20; tries++) {
        x = 4 + rnd() * (FIELD.w - 8);
        y = 4 + rnd() * (FIELD.h - 8);
        if (Math.hypot(x - cx, y - cy) > r + 6) break;
      }
      stars.push({ id: starId++, x, y });
    }
    waves.push({ cx, cy, r, stars });
  }
  return waves;
}

/** Raund davomiyligi (ms, sanoqsiz) */
export function zoneDurationMs(final: boolean): number {
  return (final ? 5 : 3) * (WAVE_MS + LOCK_MS);
}

/** Hozir qaysi to'lqin va bosqich: -1 — boshlanmagan; lock — zona yopilgan (to'xtash vaqti) */
export function zonePhase(startedAt: number, now: number, waves: number): { wave: number; lock: boolean; waveEndsAt: number; done: boolean } {
  if (now < startedAt) return { wave: -1, lock: false, waveEndsAt: startedAt + WAVE_MS, done: false };
  const span = WAVE_MS + LOCK_MS;
  const w = Math.floor((now - startedAt) / span);
  if (w >= waves) return { wave: waves - 1, lock: true, waveEndsAt: startedAt + (waves - 1) * span + WAVE_MS, done: true };
  const start = startedAt + w * span;
  return { wave: w, lock: now >= start + WAVE_MS, waveEndsAt: start + WAVE_MS, done: false };
}

/** Robot zonadami (markazi zona ichida — chetiga tegib turgani ham hisoblanadi) */
export function insideZone(x: number, y: number, wave: ZoneWave): boolean {
  return Math.hypot(x - wave.cx, y - wave.cy) <= wave.r + ROBOT_R * 0.5;
}

/** Ochko: har omon qolingan to'lqin 150, oxirigacha qolganga +300, har yulduz 30; final ikki baravar */
export function zonePoints(survived: number, waves: number, stars: number, final: boolean): number {
  const s = Math.max(0, Math.min(waves, survived));
  const total = s * 150 + (s >= waves ? 300 : 0) + Math.min(MAX_STARS, Math.max(0, Math.floor(stars))) * 30;
  return final ? total * 2 : total;
}

/** Robot ranglari */
export const ROBOT_COLORS = ["#22d3ee", "#f472b6", "#a3e635", "#fbbf24", "#a78bfa", "#fb7185", "#34d399", "#60a5fa", "#f97316", "#e879f9"];

/** Server javobidagi robot: [id, ism, x, y, rang, o'chganmi (1/0)] — ixcham */
export type ZonePeer = [string, string, number, number, number, number];

/** Boshlanish joyi: maydon o'rtasida aylana bo'ylab */
export function zoneSpawn(i: number, n: number): { x: number; y: number } {
  const a = (i / Math.max(1, n)) * Math.PI * 2;
  const rr = Math.min(18, 6 + n * 0.6);
  return { x: FIELD.w / 2 + Math.cos(a) * rr, y: FIELD.h / 2 + Math.sin(a) * rr * 0.7 };
}
