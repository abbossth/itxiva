// Sarguzasht rejimlari: Robot poyga, Raketa parvozi, Ko'prikdan o'tish, Oltin kon, Hudud bosib olish.
// Javob paytida ochko berilmaydi — natija ochilganda hammaga birdan (tezlik tartibida) hisoblanadi.
// Sof funksiyalar: server ham, test ham shu yerdan foydalanadi.

import type { LiveGameMode } from "@/lib/db/models/live-game.model";

export const ADVENTURE_MODES = ["race", "rocket", "bridge", "gold", "territory"] as const;
export type AdventureMode = (typeof ADVENTURE_MODES)[number];
export const isAdventure = (m: LiveGameMode | string): m is AdventureMode => (ADVENTURE_MODES as readonly string[]).includes(m);

/** Kutish zalidagi rejim introsi (ms) */
export const INTRO_MS = 4500;

// ---- Taktikalar: o'quvchi javob bergach telefonda tanlaydi (faqat javob to'g'ri bo'lsa ishlaydi; xavfli taktikalar xatoda jazolaydi) ----

export interface Tactic {
  id: string;
  icon: string;
  title: string;
  hint: string;
  /** Nishon tanlanadi (poygada oldingi robot, hududda qo'shni raqib) */
  target?: boolean;
}

export const TACTICS: Record<AdventureMode, Tactic[]> = {
  race: [
    { id: "turbo", icon: "🔥", title: "Turbo", hint: "To'g'ri: +40% yo'l · Xato: dvigatel qiziydi, 30 m orqaga" },
    { id: "zap", icon: "⚡", title: "Elektr to'r", hint: "Oldingi robotni 50 m orqaga surasiz (o'zingiz sekinroq)", target: true },
    { id: "shield", icon: "🛡️", title: "Qalqon", hint: "To'rlar sizga ta'sir qilmaydi, yo'l biroz qisqaroq" },
  ],
  rocket: [
    { id: "careful", icon: "🪂", title: "Ehtiyotkor", hint: "To'g'ri: ×0.7 balandlik · Xato: atigi -20 km" },
    { id: "steady", icon: "🛰️", title: "Barqaror", hint: "To'g'ri: oddiy parvoz · Xato: -60 km" },
    { id: "boost", icon: "☄️", title: "Forsaj", hint: "To'g'ri: ×1.7 balandlik! · Xato: -200 km" },
  ],
  bridge: [
    { id: "0", icon: "⬅️", title: "Chap taxta", hint: "Uchta taxtadan bittasi yoriq" },
    { id: "1", icon: "⬆️", title: "O'rta taxta", hint: "Singan taxtani hamma ko'radi" },
    { id: "2", icon: "➡️", title: "O'ng taxta", hint: "Oldingilar izidan yuring!" },
  ],
  gold: [
    { id: "shallow", icon: "🪨", title: "Yuza qatlam", hint: "Bomba yo'q, lekin olmos ham yo'q" },
    { id: "mid", icon: "⛏️", title: "O'rta qatlam", hint: "Oltin va xalta · bomba ehtimoli bor" },
    { id: "deep", icon: "💎", title: "Chuqur qatlam", hint: "Olmos ko'p… bomba ham ko'p!" },
  ],
  territory: [
    { id: "expand", icon: "🚩", title: "Kengayish", hint: "Bo'sh yerlarni egallaysiz" },
    { id: "attack", icon: "⚔️", title: "Hujum", hint: "Qo'shni raqibdan +1 ko'proq katak tortib olasiz", target: true },
    { id: "defend", icon: "🏰", title: "Mudofaa", hint: "Bu raund kataklaringizni hech kim ololmaydi (+1 katak)" },
  ],
};
/** Taktika tanlanmasa */
export const DEFAULT_TACTIC: Record<AdventureMode, string> = { race: "normal", rocket: "steady", bridge: "random", gold: "mid", territory: "expand" };
export const isTactic = (mode: AdventureMode, id: string) => TACTICS[mode].some((t) => t.id === id);

/** Ko'prikda har qadamda 3 ta taxta, bittasi yoriq */
export const PLANKS = 3;
export function makeCracks(length: number, rng: () => number = Math.random): number[] {
  return Array.from({ length }, () => Math.floor(Math.min(0.999999, Math.max(0, rng())) * PLANKS));
}
/** Elektr to'r: nishon shuncha metr orqaga (bir raundda ko'pi bilan ZAP_CAP) */
export const ZAP_METERS = 50;
export const ZAP_CAP = 100;

/** Poyga marrasi (metr): har savolga ~100 m — eng tezlar oxiridan oldinroq yetib boradi */
export const raceFinish = (total: number) => Math.max(400, total * 100);
/** Ko'prik uzunligi (taxta) */
export const bridgeLength = (total: number) => Math.max(4, Math.ceil(total * 0.6));
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

/** Qatlamlar bo'yicha topilmalar vazni (o'rta qatlam — asosiy jadval) */
const DEPTH_WEIGHTS: Record<string, Record<DigKind, number>> = {
  shallow: { gold: 55, bag: 15, diamond: 0, bomb: 0, rock: 30 },
  mid: { gold: 38, bag: 22, diamond: 8, bomb: 16, rock: 16 },
  deep: { gold: 5, bag: 15, diamond: 30, bomb: 35, rock: 15 },
};

export function rollDig(rng: () => number, depth: string = "mid"): DigKind {
  const weights = DEPTH_WEIGHTS[depth] ?? DEPTH_WEIGHTS.mid;
  const list = (Object.keys(DIGS) as DigKind[]).map((k) => [k, weights[k]] as const);
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = Math.min(0.999999, Math.max(0, rng())) * total;
  for (const [k, w] of list) {
    if (x < w) return k;
    x -= w;
  }
  return "rock";
}
/** Chuqur qatlamdagi bomba kuchliroq */
const digAmount = (k: DigKind, depth: string) => (k === "bomb" && depth === "deep" ? -250 : DIGS[k].amount);

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
  /** Tanlangan taktika (bo'lmasa — DEFAULT_TACTIC) */
  tactic?: string | null;
  /** Nishon: poygada o'yinchi id'si, hududda raqib tartib raqami (slot) */
  target?: string | null;
}

export interface AdvEffect {
  kind: "move" | "finish" | "stall" | "fly" | "fall" | "step" | "splash" | "crack" | "dig" | "claim" | "lost" | "defend" | "none";
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
  /** Ko'prik: har qadamdagi yoriq taxta (yashirin) va ochilgan taxtalar (bit maskasi) */
  cracks?: number[];
  known?: number[];
}

export interface AdvResult {
  out: AdvOut[];
  cells: number[];
  events: string[];
  /** Ko'prik: yangilangan ochilgan taxtalar */
  known?: number[];
}

const speedOf = (p: AdvPlayer, limitMs: number) => (p.correct ? Math.max(0, Math.min(1, 1 - p.ms / Math.max(1, limitMs))) : 0);

/** Natija ochilganda: har o'yinchiga rejim va tanlangan taktika ta'siri */
export function revealAdventure(mode: AdventureMode, players: AdvPlayer[], ctx: AdvContext): AdvResult {
  if (mode === "territory") return revealTerritory(players, ctx);
  const events: string[] = [];
  // Tezlar birinchi (marraga yetish tartibi shunga bog'liq)
  const order = [...players].sort((a, b) => Number(b.correct) - Number(a.correct) || a.ms - b.ms);
  let finishedBefore = players.filter((p) => p.finished).length;
  const out: AdvOut[] = [];
  const known = [...(ctx.known ?? [])];
  const tacticOf = (p: AdvPlayer) => (p.tactic && isTactic(mode, p.tactic) ? p.tactic : DEFAULT_TACTIC[mode]);
  for (const p of order) {
    const f = speedOf(p, ctx.limitMs);
    const tactic = tacticOf(p);
    const none = (text: string): AdvOut => ({ id: p.id, score: p.score, progress: p.progress, finished: p.finished, effect: { kind: "none", text, delta: 0, items: [] } });

    if (mode === "race") {
      const finish = raceFinish(ctx.total);
      if (p.finished) {
        out.push(none("Marradasiz! 🏁"));
        continue;
      }
      if (!p.correct) {
        // Turbo xato javobda qizib ketadi
        const back = tactic === "turbo" ? Math.min(30, p.progress) : 0;
        out.push({
          id: p.id,
          score: Math.max(0, p.score - back),
          progress: p.progress - back,
          finished: false,
          effect: back > 0 ? { kind: "stall", text: `Turbo qizib ketdi: -${back} m`, delta: -Math.min(back, p.score), items: ["💥"] } : { kind: "stall", text: "Robot joyida qoldi 🔧", delta: 0, items: [] },
        });
        continue;
      }
      const streakBonus = p.streak >= 3 ? 25 : 0;
      const mult = tactic === "turbo" ? 1.4 : tactic === "zap" ? 0.8 : tactic === "shield" ? 0.85 : 1;
      const move = Math.round((70 + 50 * f) * mult) + streakBonus;
      const progress = Math.min(finish, p.progress + move);
      const gained = progress - p.progress;
      const items = [...(tactic === "turbo" || streakBonus ? ["🔥"] : []), ...(tactic === "shield" ? ["🛡️"] : [])];
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
        const label = tactic === "turbo" ? " · turbo!" : streakBonus ? " · seriya!" : "";
        out.push({ id: p.id, score: p.score + gained, progress, finished: false, effect: { kind: "move", text: `+${gained} m${label}`, delta: gained, items } });
      }
      continue;
    }

    if (mode === "rocket") {
      if (p.correct) {
        const boost = p.streak >= 3 ? 1.3 : 1;
        const mult = tactic === "careful" ? 0.7 : tactic === "boost" ? 1.7 : 1;
        const up = Math.round((100 + 100 * f) * boost * mult);
        const progress = p.progress + up;
        const passed = ROCKET_MILESTONES.filter((m) => p.progress < m.km && progress >= m.km);
        for (const m of passed) events.push(`${m.icon} ${p.name} — ${m.label}ga yetdi!`);
        const label = tactic === "boost" ? " · forsaj!" : boost > 1 ? " · seriya!" : "";
        out.push({
          id: p.id,
          score: p.score + up,
          progress,
          finished: false,
          effect: { kind: "fly", text: `+${up} km${label}`, delta: up, items: [...(tactic === "boost" ? ["☄️"] : []), ...passed.map((m) => m.icon)] },
        });
      } else {
        const fall = tactic === "careful" ? 20 : tactic === "boost" ? 200 : ROCKET_FALL;
        const down = Math.min(fall, p.progress);
        if (tactic === "boost" && down >= 100) events.push(`💥 ${p.name}ning forsaji portladi: -${down} km`);
        out.push({
          id: p.id,
          score: p.score - down,
          progress: p.progress - down,
          finished: false,
          effect: {
            kind: "fall",
            text: down > 0 ? (tactic === "boost" ? `Forsaj portladi: -${down} km` : tactic === "careful" ? `Parashyut: atigi -${down} km` : `Yoqilg'i tugadi: -${down} km`) : "Raketa uchmadi",
            delta: -down,
            items: [tactic === "boost" ? "💥" : tactic === "careful" ? "🪂" : "💨"],
          },
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
      if (!p.correct) {
        if (p.progress > 0) {
          out.push({ id: p.id, score: Math.max(0, p.score - 100), progress: p.progress - 1, finished: false, effect: { kind: "splash", text: "Suvga tushdingiz! Bir qadam orqaga", delta: -Math.min(100, p.score), items: ["💦"] } });
        } else out.push({ id: p.id, score: p.score, progress: 0, finished: false, effect: { kind: "splash", text: "Qirg'oqdan siljimadingiz", delta: 0, items: ["💦"] } });
        continue;
      }
      const pos = p.progress;
      const plank = /^[0-2]$/.test(tactic) ? Number(tactic) : Math.floor(Math.min(0.999999, Math.max(0, ctx.rng())) * PLANKS);
      const crack = ctx.cracks?.[pos] ?? -1;
      // Bosilgan taxta hammaga ochiladi (singan yoki mustahkam)
      while (known.length <= pos) known.push(0);
      known[pos] |= 1 << plank;
      if (plank === crack) {
        events.push(`🪵 ${p.name} ${pos + 1}-qadamdagi yoriq taxtani topdi!`);
        out.push({ id: p.id, score: p.score + 50, progress: pos, finished: false, effect: { kind: "crack", text: "Taxta sindi! Joyingizda qoldingiz (+50)", delta: 50, items: ["🪵"] } });
        continue;
      }
      const progress = pos + 1;
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
      continue;
    }

    // gold
    if (!p.correct) {
      out.push({ ...none("Kirka sindi — kovlay olmadingiz"), effect: { kind: "stall", text: "Kirka sindi — kovlay olmadingiz ⛏️", delta: 0, items: [] } });
      continue;
    }
    const digs = f >= 0.6 ? 2 : 1;
    const found: DigKind[] = Array.from({ length: digs }, () => rollDig(ctx.rng, tactic));
    const sum = found.reduce((s, k) => s + digAmount(k, tactic), 0);
    const score = Math.max(0, p.score + sum);
    const diamonds = found.filter((k) => k === "diamond").length;
    if (diamonds > 0) events.push(`💎 ${p.name} ${tactic === "deep" ? "chuqurdan " : ""}olmos topdi!`);
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

  // Poyga: elektr to'rlar (yurishlardan keyin; marraga yetganlar va qalqondagilar daxlsiz)
  if (mode === "race") {
    const byId = new Map(out.map((o) => [o.id, o]));
    const lost = new Map<string, number>();
    for (const p of order) {
      if (!p.correct || tacticOf(p) !== "zap") continue;
      const ahead = players.filter((q) => q.id !== p.id && !q.finished && q.progress > p.progress && !byId.get(q.id)?.finished);
      const chosen = ahead.find((q) => q.id === p.target) ?? [...ahead].sort((a, b) => a.progress - b.progress)[0];
      const me = byId.get(p.id)!;
      if (!chosen) {
        me.effect = { ...me.effect, text: `${me.effect.text} · to'r bo'sh ketdi` };
        continue;
      }
      const t = byId.get(chosen.id)!;
      if (chosen.correct && tacticOf(chosen) === "shield") {
        events.push(`🛡️ ${chosen.name}ning qalqoni ${p.name}ning to'rini qaytardi`);
        me.effect = { ...me.effect, text: `${me.effect.text} · ${chosen.name} qalqonda!` };
        continue;
      }
      const already = lost.get(chosen.id) ?? 0;
      const hit = Math.min(ZAP_METERS, ZAP_CAP - already, t.progress);
      if (hit <= 0) continue;
      lost.set(chosen.id, already + hit);
      const scoreHit = Math.min(hit, t.score);
      t.progress -= hit;
      t.score -= scoreHit;
      t.effect = { ...t.effect, text: `${t.effect.text} · ⚡ ${p.name} -${hit} m`, delta: t.effect.delta - scoreHit, items: [...t.effect.items, "⚡"] };
      me.effect = { ...me.effect, text: `${me.effect.text} · ⚡ ${chosen.name} -${hit} m`, items: [...me.effect.items, "⚡"] };
      events.push(`⚡ ${p.name} ${chosen.name}ning robotini ${hit} m orqaga surdi!`);
    }
  }
  return { out, cells: ctx.cells, events, ...(mode === "bridge" ? { known } : {}) };
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

function revealTerritory(players: AdvPlayer[], ctx: AdvContext): AdvResult {
  const cells = ctx.cells.length === GRID_W * GRID_H ? [...ctx.cells] : emptyCells();
  const bySlot = new Map(players.map((p) => [p.slot, p]));
  const gained = new Map<string, number>();
  const lost = new Map<string, Map<string, number>>();
  const blocked = new Map<string, string>();
  const events: string[] = [];
  const tacticOf = (p: AdvPlayer) => (p.tactic && isTactic("territory", p.tactic) ? p.tactic : "expand");
  // Mudofaadagilar (to'g'ri javob bilan) — bu raund ularning kataklariga tegib bo'lmaydi
  const fort = new Set(players.filter((p) => p.correct && tacticOf(p) === "defend").map((p) => p.slot));
  const claimers = players
    .filter((p) => p.correct)
    .sort((a, b) => a.ms - b.ms)
    .map((p) => {
      const f = speedOf(p, ctx.limitMs);
      const t = tacticOf(p);
      const k = t === "defend" ? 1 : 1 + (f >= 0.5 ? 1 : 0) + (p.streak >= 3 ? 1 : 0) + (t === "attack" ? 1 : 0);
      return { p, k, t };
    });
  const count = (slot: number) => cells.reduce((n, c) => n + (c === slot ? 1 : 0), 0);
  const takeable = (i: number, p: AdvPlayer) => cells[i] !== p.slot && !(cells[i] >= 0 && fort.has(cells[i]));

  const take = (p: AdvPlayer, target: number) => {
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

  const claimOne = (p: AdvPlayer, tactic: string) => {
    const base = baseCell(p.slot);
    const own = cells.map((c, i) => (c === p.slot ? i : -1)).filter((i) => i >= 0);
    if (own.length === 0) {
      // Birinchi katak: bazaga eng yaqin bo'sh joy (bo'lmasa — eng yaqin himoyasiz raqib katagi)
      const order = cells.map((_, i) => i).sort((a, b) => dist(a, base) - dist(b, base));
      const target = order.find((i) => cells[i] === -1) ?? order.find((i) => takeable(i, p)) ?? -1;
      if (target >= 0) take(p, target);
      return;
    }
    const frontier = [...new Set(own.flatMap(neighbors))].filter((i) => cells[i] !== p.slot);
    // Hujum: tanlangan qo'shni raqibning chegaradagi kataklari
    if (tactic === "attack") {
      const victimSlot = Number(p.target);
      const victim = Number.isInteger(victimSlot) ? bySlot.get(victimSlot) : undefined;
      const border = victim ? frontier.filter((i) => cells[i] === victimSlot) : [];
      if (victim && border.length > 0) {
        if (fort.has(victimSlot)) {
          blocked.set(p.id, victim.name);
          return;
        }
        take(p, border[Math.floor(ctx.rng() * border.length)]);
        return;
      }
    }
    const free = frontier.filter((i) => cells[i] === -1);
    let target = -1;
    if (free.length > 0) target = free[Math.floor(ctx.rng() * free.length)];
    else {
      // Bo'sh joy qolmasa — chegaradosh himoyasiz raqibdan (eng kattasidan) tortib olinadi
      const open = frontier.filter((i) => takeable(i, p));
      if (open.length > 0) {
        const best = Math.max(...open.map((i) => count(cells[i])));
        const pool = open.filter((i) => count(cells[i]) === best);
        target = pool[Math.floor(ctx.rng() * pool.length)];
      }
    }
    if (target >= 0) take(p, target);
  };

  for (let r = 0; r < 4; r++) for (const c of claimers) if (c.k > r && !blocked.has(c.p.id)) claimOne(c.p, c.t);

  const out: AdvOut[] = players.map((p) => {
    const n = count(p.slot);
    const score = n * CELL_POINTS;
    const g = gained.get(p.id) ?? 0;
    const l = lost.get(p.id);
    const lostN = l ? [...l.values()].reduce((s, v) => s + v, 0) : 0;
    const t = tacticOf(p);
    let effect: AdvEffect;
    if (blocked.has(p.id)) effect = { kind: "lost", text: `Hujum ${blocked.get(p.id)}ning qal'asiga urildi${g ? ` · +${g} katak` : ""}`, delta: score - p.score, items: ["🏰"] };
    else if (p.correct && t === "defend") effect = { kind: "defend", text: `Mudofaa: hududingiz himoyada${g ? ` · +${g} katak` : ""}`, delta: score - p.score, items: ["🏰"] };
    else if (g > 0) effect = { kind: "claim", text: `+${g} katak${lostN ? `, -${lostN} tortib olindi` : ""}`, delta: score - p.score, items: [t === "attack" && p.correct ? "⚔️" : "🚩"] };
    else if (lostN > 0) effect = { kind: "lost", text: `${[...l!.keys()].join(", ")} ${lostN} katagingizni tortib oldi`, delta: score - p.score, items: ["⚔️"] };
    else effect = { kind: p.correct ? "none" : "stall", text: p.correct ? "Hudud o'zgarmadi" : "Bu safar katak yo'q", delta: score - p.score, items: [] };
    return { id: p.id, score, progress: n, finished: false, effect };
  });
  for (const [vid, m] of lost) {
    const v = players.find((p) => p.id === vid);
    for (const [name, n] of m) if (v && n >= 2) events.push(`⚔️ ${name} ${v.name}dan ${n} katak tortib oldi`);
  }
  for (const [aid, vname] of blocked) {
    const a = players.find((p) => p.id === aid);
    if (a) events.push(`🏰 ${vname} ${a.name}ning hujumini qaytardi`);
  }
  return { out, cells, events };
}

/** Hudud: o'yinchi bilan chegaradosh raqiblar (tartib raqamlari) */
export function borderRivals(cells: number[], slot: number): number[] {
  const set = new Set<number>();
  cells.forEach((c, i) => {
    if (c !== slot) return;
    for (const j of neighbors(i)) if (cells[j] >= 0 && cells[j] !== slot) set.add(cells[j]);
  });
  return [...set];
}
