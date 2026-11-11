// Sarguzasht rejimlari: Robot poyga, Raketa parvozi, Ko'prikdan o'tish, Oltin kon, Hudud bosib olish.
// Javob paytida ochko berilmaydi — natija ochilganda hammaga birdan (tezlik tartibida) hisoblanadi.
// Sof funksiyalar: server ham, test ham shu yerdan foydalanadi.

import type { LiveGameMode } from "@/lib/db/models/live-game.model";

export const ADVENTURE_MODES = ["race", "rocket", "bridge", "gold", "territory"] as const;
export type AdventureMode = (typeof ADVENTURE_MODES)[number];
export const isAdventure = (m: LiveGameMode | string): m is AdventureMode => (ADVENTURE_MODES as readonly string[]).includes(m);

/** Kutish zalidagi rejim introsi (ms) */
export const INTRO_MS = 4500;

/** Poyga marrasi (metr): har savolga ~100 m — eng tezlar oxiridan oldinroq yetib boradi */
export const raceFinish = (total: number) => Math.max(400, total * 100);
/** Ko'prik uzunligi (taxta) */
export const bridgeLength = (total: number) => Math.max(4, Math.ceil(total * 0.7));
/** Marraga birinchi yetganlarga qo'shimcha */
export const FINISH_BONUS = [300, 200, 100, 50];
/** Raketa: muhim balandliklar */
export const ROCKET_MILESTONES = [
  { km: 500, label: "Bulutlar", icon: "☁️" },
  { km: 1200, label: "Stratosfera", icon: "🌌" },
  { km: 2000, label: "Koinot", icon: "🛰️" },
  { km: 3000, label: "Oy", icon: "🌙" },
];
export const ROCKET_FALL = 60;
/** Hudud xaritasi */
export const GRID_W = 16;
export const GRID_H = 9;
export const CELL_POINTS = 100;

export type DigKind = "gold" | "bag" | "diamond" | "bomb" | "rock";
export const DIGS: Record<DigKind, { amount: number; weight: number; icon: string; label: string }> = {
  gold: { amount: 150, weight: 38, icon: "🪙", label: "oltin" },
  bag: { amount: 300, weight: 22, icon: "💰", label: "xalta oltin" },
  diamond: { amount: 700, weight: 8, icon: "💎", label: "olmos" },
  bomb: { amount: -200, weight: 16, icon: "💣", label: "bomba" },
  rock: { amount: 0, weight: 16, icon: "🪨", label: "tosh" },
};

export function rollDig(rng: () => number): DigKind {
  const list = Object.entries(DIGS) as [DigKind, (typeof DIGS)[DigKind]][];
  const total = list.reduce((s, [, d]) => s + d.weight, 0);
  let x = Math.min(0.999999, Math.max(0, rng())) * total;
  for (const [k, d] of list) {
    if (x < d.weight) return k;
    x -= d.weight;
  }
  return "rock";
}

export interface AdvPlayer {
  id: string;
  name: string;
  /** Qo'shilish tartibi (hudud rangi va bazasi) */
  slot: number;
  score: number;
  progress: number;
  finished: boolean;
  /** Shu savol bilan birga ketma-ket to'g'ri javoblar */
  streak: number;
  correct: boolean;
  ms: number;
}

export interface AdvEffect {
  kind: "move" | "finish" | "stall" | "fly" | "fall" | "step" | "splash" | "dig" | "claim" | "lost" | "none";
  text: string;
  /** Ochko o'zgarishi */
  delta: number;
  /** Ko'rsatish uchun belgilar (masalan, kovlangan narsalar) */
  items: string[];
}

export interface AdvOut {
  id: string;
  score: number;
  progress: number;
  finished: boolean;
  effect: AdvEffect;
}

export interface AdvContext {
  total: number;
  limitMs: number;
  cells: number[];
  rng: () => number;
}

const speedOf = (p: AdvPlayer, limitMs: number) => (p.correct ? Math.max(0, Math.min(1, 1 - p.ms / Math.max(1, limitMs))) : 0);

/** Natija ochilganda: har o'yinchiga rejim ta'siri */
export function revealAdventure(mode: AdventureMode, players: AdvPlayer[], ctx: AdvContext): { out: AdvOut[]; cells: number[]; events: string[] } {
  if (mode === "territory") return revealTerritory(players, ctx);
  const events: string[] = [];
  // Tezlar birinchi (marraga yetish tartibi shunga bog'liq)
  const order = [...players].sort((a, b) => Number(b.correct) - Number(a.correct) || a.ms - b.ms);
  let finishedBefore = players.filter((p) => p.finished).length;
  const out: AdvOut[] = [];
  for (const p of order) {
    const f = speedOf(p, ctx.limitMs);
    const none = (text: string): AdvOut => ({ id: p.id, score: p.score, progress: p.progress, finished: p.finished, effect: { kind: "none", text, delta: 0, items: [] } });

    if (mode === "race") {
      const finish = raceFinish(ctx.total);
      if (p.finished) {
        out.push(none("Marradasiz! 🏁"));
        continue;
      }
      if (!p.correct) {
        out.push({ ...none("Robot joyida qoldi"), effect: { kind: "stall", text: "Robot joyida qoldi 🔧", delta: 0, items: [] } });
        continue;
      }
      const turbo = p.streak >= 3;
      const move = Math.round(70 + 50 * f) + (turbo ? 25 : 0);
      const progress = Math.min(finish, p.progress + move);
      const gained = progress - p.progress;
      if (progress >= finish) {
        const bonus = FINISH_BONUS[finishedBefore] ?? 0;
        finishedBefore++;
        events.push(`🏁 ${p.name} marraga ${finishedBefore}-bo'lib yetdi!`);
        out.push({
          id: p.id,
          score: p.score + gained + bonus,
          progress,
          finished: true,
          effect: { kind: "finish", text: `Marra! ${finishedBefore}-o'rin${bonus ? ` · +${bonus}` : ""}`, delta: gained + bonus, items: ["🏁"] },
        });
      } else {
        out.push({ id: p.id, score: p.score + gained, progress, finished: false, effect: { kind: "move", text: `+${gained} m${turbo ? " · turbo!" : ""}`, delta: gained, items: turbo ? ["🔥"] : [] } });
      }
      continue;
    }

    if (mode === "rocket") {
      if (p.correct) {
        const boost = p.streak >= 3 ? 1.3 : 1;
        const up = Math.round((100 + 100 * f) * boost);
        const progress = p.progress + up;
        const passed = ROCKET_MILESTONES.filter((m) => p.progress < m.km && progress >= m.km);
        for (const m of passed) events.push(`${m.icon} ${p.name} — ${m.label}ga yetdi!`);
        out.push({
          id: p.id,
          score: p.score + up,
          progress,
          finished: false,
          effect: { kind: "fly", text: `+${up} km${boost > 1 ? " · forsaj!" : ""}`, delta: up, items: passed.map((m) => m.icon) },
        });
      } else {
        const down = Math.min(ROCKET_FALL, p.progress);
        out.push({
          id: p.id,
          score: p.score - down,
          progress: p.progress - down,
          finished: false,
          effect: { kind: "fall", text: down > 0 ? `Yoqilg'i tugadi: -${down} km` : "Raketa uchmadi", delta: -down, items: ["💨"] },
        });
      }
      continue;
    }

    if (mode === "bridge") {
      const len = bridgeLength(ctx.total);
      if (p.finished) {
        out.push(none("Narigi qirg'oqdasiz! 🏝️"));
        continue;
      }
      if (p.correct) {
        const progress = p.progress + 1;
        const gained = 100 + Math.round(50 * f);
        if (progress >= len) {
          const bonus = FINISH_BONUS[finishedBefore] ?? 0;
          finishedBefore++;
          events.push(`🏝️ ${p.name} ko'prikdan ${finishedBefore}-bo'lib o'tdi!`);
          out.push({
            id: p.id,
            score: p.score + gained + bonus,
            progress,
            finished: true,
            effect: { kind: "finish", text: `Narigi qirg'oq! ${finishedBefore}-o'rin${bonus ? ` · +${bonus}` : ""}`, delta: gained + bonus, items: ["🏝️"] },
          });
        } else out.push({ id: p.id, score: p.score + gained, progress, finished: false, effect: { kind: "step", text: "Bir qadam oldinga!", delta: gained, items: ["👣"] } });
      } else if (p.progress > 0) {
        out.push({ id: p.id, score: Math.max(0, p.score - 100), progress: p.progress - 1, finished: false, effect: { kind: "splash", text: "Suvga tushdingiz! Bir qadam orqaga", delta: -Math.min(100, p.score), items: ["💦"] } });
      } else out.push({ id: p.id, score: p.score, progress: 0, finished: false, effect: { kind: "splash", text: "Qirg'oqdan siljimadingiz", delta: 0, items: ["💦"] } });
      continue;
    }

    // gold
    if (!p.correct) {
      out.push({ ...none("Kirka sindi — kovlay olmadingiz"), effect: { kind: "stall", text: "Kirka sindi — kovlay olmadingiz ⛏️", delta: 0, items: [] } });
      continue;
    }
    const digs = f >= 0.6 ? 2 : 1;
    const found: DigKind[] = Array.from({ length: digs }, () => rollDig(ctx.rng));
    const sum = found.reduce((s, k) => s + DIGS[k].amount, 0);
    const score = Math.max(0, p.score + sum);
    const diamonds = found.filter((k) => k === "diamond").length;
    if (diamonds > 0) events.push(`💎 ${p.name} olmos topdi!`);
    if (found.includes("bomb")) events.push(`💣 ${p.name} bombaga duch keldi!`);
    out.push({
      id: p.id,
      score,
      progress: p.progress + diamonds,
      finished: false,
      effect: {
        kind: "dig",
        text: found.map((k) => DIGS[k].label).join(" + ") + (sum !== 0 ? ` (${sum > 0 ? "+" : ""}${score - p.score})` : ""),
        delta: score - p.score,
        items: found.map((k) => DIGS[k].icon),
      },
    });
  }
  return { out, cells: ctx.cells, events };
}

// ---- Hudud bosib olish ----

/** O'yinchining boshlang'ich katagi: tartib raqami bo'yicha xarita bo'ylab yoyilgan */
export function baseCell(slot: number): number {
  const x = Math.floor((((slot * 0.6180339887 + 0.13) % 1) + 1) % 1 * GRID_W);
  const y = Math.floor((((slot * 0.4142135624 + 0.37) % 1) + 1) % 1 * GRID_H);
  return y * GRID_W + x;
}

const neighbors = (i: number) => {
  const x = i % GRID_W;
  const y = Math.floor(i / GRID_W);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < GRID_W - 1) out.push(i + 1);
  if (y > 0) out.push(i - GRID_W);
  if (y < GRID_H - 1) out.push(i + GRID_W);
  return out;
};
const dist = (a: number, b: number) => Math.abs((a % GRID_W) - (b % GRID_W)) + Math.abs(Math.floor(a / GRID_W) - Math.floor(b / GRID_W));

export function emptyCells(): number[] {
  return Array.from({ length: GRID_W * GRID_H }, () => -1);
}

function revealTerritory(players: AdvPlayer[], ctx: AdvContext): { out: AdvOut[]; cells: number[]; events: string[] } {
  const cells = ctx.cells.length === GRID_W * GRID_H ? [...ctx.cells] : emptyCells();
  const bySlot = new Map(players.map((p) => [p.slot, p]));
  const gained = new Map<string, number>();
  const lost = new Map<string, Map<string, number>>();
  const events: string[] = [];
  const claimers = players
    .filter((p) => p.correct)
    .sort((a, b) => a.ms - b.ms)
    .map((p) => {
      const f = speedOf(p, ctx.limitMs);
      return { p, k: 1 + (f >= 0.5 ? 1 : 0) + (p.streak >= 3 ? 1 : 0) };
    });
  const count = (slot: number) => cells.reduce((n, c) => n + (c === slot ? 1 : 0), 0);

  const claimOne = (p: AdvPlayer) => {
    const base = baseCell(p.slot);
    const own = cells.map((c, i) => (c === p.slot ? i : -1)).filter((i) => i >= 0);
    let target = -1;
    if (own.length === 0) {
      // Birinchi katak: bazaga eng yaqin bo'sh joy (bo'lmasa — eng yaqin raqib katagi)
      const order = cells.map((_, i) => i).sort((a, b) => dist(a, base) - dist(b, base));
      target = order.find((i) => cells[i] === -1) ?? order.find((i) => cells[i] !== p.slot) ?? -1;
    } else {
      const frontier = [...new Set(own.flatMap(neighbors))].filter((i) => cells[i] !== p.slot);
      const free = frontier.filter((i) => cells[i] === -1);
      if (free.length > 0) target = free[Math.floor(ctx.rng() * free.length)];
      else if (frontier.length > 0) {
        // Bo'sh joy qolmasa — chegaradosh raqibdan (eng kattasidan) tortib olinadi
        const best = Math.max(...frontier.map((i) => count(cells[i])));
        const pool = frontier.filter((i) => count(cells[i]) === best);
        target = pool[Math.floor(ctx.rng() * pool.length)];
      }
    }
    if (target < 0) return;
    const prev = cells[target];
    cells[target] = p.slot;
    gained.set(p.id, (gained.get(p.id) ?? 0) + 1);
    if (prev >= 0) {
      const victim = bySlot.get(prev);
      if (victim) {
        const m = lost.get(victim.id) ?? new Map<string, number>();
        m.set(p.name, (m.get(p.name) ?? 0) + 1);
        lost.set(victim.id, m);
      }
    }
  };

  for (let r = 0; r < 3; r++) for (const c of claimers) if (c.k > r) claimOne(c.p);

  const out: AdvOut[] = players.map((p) => {
    const n = count(p.slot);
    const score = n * CELL_POINTS;
    const g = gained.get(p.id) ?? 0;
    const l = lost.get(p.id);
    const lostN = l ? [...l.values()].reduce((s, v) => s + v, 0) : 0;
    let effect: AdvEffect;
    if (g > 0) effect = { kind: "claim", text: `+${g} katak${lostN ? `, -${lostN} tortib olindi` : ""}`, delta: score - p.score, items: ["🚩"] };
    else if (lostN > 0) effect = { kind: "lost", text: `${[...l!.keys()].join(", ")} ${lostN} katagingizni tortib oldi`, delta: score - p.score, items: ["⚔️"] };
    else effect = { kind: p.correct ? "none" : "stall", text: p.correct ? "Hudud o'zgarmadi" : "Bu safar katak yo'q", delta: score - p.score, items: [] };
    return { id: p.id, score, progress: n, finished: false, effect };
  });
  for (const [vid, m] of lost) {
    const v = players.find((p) => p.id === vid);
    for (const [name, n] of m) if (v && n >= 2) events.push(`⚔️ ${name} ${v.name}dan ${n} katak tortib oldi`);
  }
  return { out, cells, events };
}
