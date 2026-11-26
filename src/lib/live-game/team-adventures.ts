// Jamoaviy sarguzashtlar: Arqon tortish, Qal'a qamali, Penalti jangi, Orol xazinasi.
// O'quvchilar jamoalarga bo'linadi; har savoldan keyin telefonda taktika tanlanadi, natija ochilganda jamoa holati
// (arqon, qal'alar, gollar, oroldagi joy) o'zgaradi va har kimga o'z hissasiga qarab ochko yoziladi.
// Jamoa holati o'yinning `cells` massivida saqlanadi. Sof funksiyalar: server, brauzer va testlar uchun umumiy.

import type { AdvEffect, AdvOut, AdvPlayer, AdvResult, Tactic } from "./adventures";

export const TEAM_ADVENTURES = ["tug", "siege", "football", "island"] as const;
export type TeamAdventure = (typeof TEAM_ADVENTURES)[number];
export const isTeamAdventure = (m: string): m is TeamAdventure => (TEAM_ADVENTURES as readonly string[]).includes(m);

/** Jamoalar soni: arqon va futbol — doim 2 ta, qolganlari 2–4 */
export const TEAM_ADV_TEAMS: Record<TeamAdventure, { min: number; max: number }> = {
  tug: { min: 2, max: 2 },
  football: { min: 2, max: 2 },
  siege: { min: 2, max: 4 },
  island: { min: 2, max: 4 },
};
export const teamsFor = (mode: TeamAdventure, requested: number) =>
  Math.min(TEAM_ADV_TEAMS[mode].max, Math.max(TEAM_ADV_TEAMS[mode].min, Math.round(Number(requested) || 2)));

export const TEAM_TACTICS: Record<TeamAdventure, Tactic[]> = {
  tug: [
    { id: "pull", icon: "💪", title: "Kuchli tortish", hint: "Oddiy kuch bilan arqonni tortasiz" },
    { id: "anchor", icon: "🦶", title: "Mahkam turish", hint: "Kuchingiz kamroq, lekin raqib jamoa tortishini susaytirasiz" },
    { id: "jerk", icon: "🔥", title: "Siltash", hint: "To'g'ri: ×1.8 kuch! · Xato: sirpanib, raqibga yordam berasiz" },
  ],
  siege: [
    { id: "attack", icon: "🏹", title: "Hujum", hint: "Tanlangan raqib qal'asiga o'q yog'dirasiz", target: true },
    { id: "repair", icon: "🧱", title: "Ta'mirlash", hint: "O'z qal'angiz devorini tiklaysiz" },
    { id: "shield", icon: "🛡️", title: "Qalqon", hint: "Bu raund qal'angizga tushadigan zarar kamayadi" },
  ],
  football: [
    { id: "left", icon: "⬅️", title: "Chap burchak", hint: "Shu burchakka zarba · jamoangiz ko'p tanlagan burchakni darvozabon qo'riqlaydi" },
    { id: "center", icon: "⬆️", title: "O'rta", hint: "Shu yerga zarba · raqib qayerni qo'riqlashini taxmin qiling!" },
    { id: "right", icon: "➡️", title: "O'ng burchak", hint: "Shu burchakka zarba · tez javob — kuchliroq zarba" },
  ],
  island: [
    { id: "roll", icon: "🎲", title: "Oddiy yurish", hint: "Tez javob — ko'proq qadam" },
    { id: "leap", icon: "🦘", title: "Tavakkal", hint: "To'g'ri: ×2 qadam! · Xato: jamoa orqaga suriladi" },
    { id: "compass", icon: "🧭", title: "Kompas", hint: "Qadam kamroq, lekin jamoa 🐊 timsohdan qochadi" },
  ],
};
export const TEAM_DEFAULT_TACTIC: Record<TeamAdventure, string> = { tug: "pull", siege: "attack", football: "center", island: "roll" };

// Holat (cells) tuzilishi — oxirgi qismlari OLDINGI holat (proyektor animatsiyasi uchun):
//   tug:      [arqon (-100…100), 0-jamoa g'alabalari, 1-jamoa g'alabalari, oldingi arqon]
//   siege:    [qal'a HP ×4, oldingi HP ×4]
//   football: [0-jamoa gollari, 1-jamoa gollari, oldingi ×2]
//   island:   [joy ×4, marraga yetish tartibi ×4 (0 — yetmagan), oldingi joy ×4]
// ---- Arqon tortish ----
export const ROPE_WIN = 100;
export const ROPE_BONUS = 300;
// ---- Qal'a qamali: cells = [har jamoa qal'asi HP] ----
export const CASTLE_HP = 1000;
// ---- Penalti: cells = [0-jamoa gollari, 1-jamoa gollari] ----
export const GOAL_POINTS = 300;
export const MAX_GOALS_PER_ROUND = 3;
export const CORNERS = ["left", "center", "right"] as const;
// ---- Orol xazinasi: cells = [jamoa joylari ×4, marraga yetish tartibi ×4 (0 — yetmagan)] ----
export const ISLAND_LEN = 36;
export type IslandCell = "path" | "palm" | "croc" | "chest";
/** Orol yo'li: 🌴 palma +4 katak, 🐊 timsoh −3, 💰 sandiq — jamoaga ochko */
export const ISLAND_BOARD: IslandCell[] = Array.from({ length: ISLAND_LEN + 1 }, (_, i) =>
  [5, 14, 23].includes(i) ? "palm" : [9, 18, 27, 32].includes(i) ? "croc" : [12, 21, 30].includes(i) ? "chest" : "path"
);
export const ISLAND_FINISH_BONUS = [500, 300, 150, 50];

export function initialTeamCells(mode: TeamAdventure, teams: number): number[] {
  if (mode === "tug") return [0, 0, 0, 0];
  if (mode === "siege") {
    const hp = Array.from({ length: 4 }, (_, t) => (t < teams ? CASTLE_HP : 0));
    return [...hp, ...hp];
  }
  if (mode === "football") return [0, 0, 0, 0];
  return Array.from({ length: 12 }, () => 0);
}

/** Oldingi holatni saqlash (natijadan oldin) */
function remember(mode: TeamAdventure, cells: number[]) {
  if (mode === "tug") cells[3] = cells[0] ?? 0;
  else if (mode === "siege") for (let t = 0; t < 4; t++) cells[4 + t] = cells[t] ?? 0;
  else if (mode === "football") {
    cells[2] = cells[0] ?? 0;
    cells[3] = cells[1] ?? 0;
  } else for (let t = 0; t < 4; t++) cells[8 + t] = cells[t] ?? 0;
}

/** Jamoalar tartibi (1-o'rindan): proyektordagi g'olib va mukofotlar shu bo'yicha */
export function teamAdventureRanking(mode: TeamAdventure, cells: number[], teams: number): number[] {
  const ids = Array.from({ length: teams }, (_, t) => t);
  const c = (i: number) => cells[i] ?? 0;
  if (mode === "tug") return ids.sort((a, b) => c(1 + b) - c(1 + a) || (b === 0 ? -c(0) : c(0)) - (a === 0 ? -c(0) : c(0)));
  if (mode === "siege") return ids.sort((a, b) => c(b) - c(a));
  if (mode === "football") return ids.sort((a, b) => c(b) - c(a));
  // Orol: avval marraga yetganlar (tartib bo'yicha), keyin eng uzoqqa borganlar
  return ids.sort((a, b) => {
    const fa = c(4 + a) || 99;
    const fb = c(4 + b) || 99;
    return fa - fb || c(b) - c(a);
  });
}

export interface TeamAdvPlayer extends AdvPlayer {
  team: number;
}
export interface TeamAdvContext {
  teams: number;
  cells: number[];
  limitMs: number;
  total: number;
  rng: () => number;
}

const speedOf = (p: AdvPlayer, limitMs: number) => (p.correct ? Math.max(0, Math.min(1, 1 - p.ms / Math.max(1, limitMs))) : 0);
const tacticOf = (mode: TeamAdventure, p: AdvPlayer) => (p.tactic && TEAM_TACTICS[mode].some((t) => t.id === p.tactic) ? p.tactic : TEAM_DEFAULT_TACTIC[mode]);
const teamName = (t: number) => ["Qizillar", "Ko'klar", "Sariqlar", "Yashillar"][t] ?? `${t + 1}-jamoa`;
const fx = (kind: AdvEffect["kind"], text: string, delta: number, items: string[] = []): AdvEffect => ({ kind, text, delta, items });

export function revealTeamAdventure(mode: TeamAdventure, players: TeamAdvPlayer[], ctx: TeamAdvContext): AdvResult {
  const teams = Math.max(2, ctx.teams);
  const init = initialTeamCells(mode, teams);
  const cells = ctx.cells.length ? [...ctx.cells] : init;
  while (cells.length < init.length) cells.push(0);
  remember(mode, cells);
  const members = (t: number) => players.filter((p) => p.team === t);
  const avgSize = players.length / teams || 1;
  if (mode === "tug") return revealTug(players, cells, ctx, members);
  if (mode === "siege") return revealSiege(players, cells, ctx, teams, members, avgSize);
  if (mode === "football") return revealFootball(players, cells, ctx, members);
  return revealIsland(players, cells, ctx, teams, members);
}

function revealTug(players: TeamAdvPlayer[], cells: number[], ctx: TeamAdvContext, members: (t: number) => TeamAdvPlayer[]): AdvResult {
  const events: string[] = [];
  const force = new Map<string, number>();
  const gift = [0, 0];
  const anchors = [0, 0];
  for (const p of players) {
    const t = tacticOf("tug", p);
    if (!p.correct) {
      if (t === "jerk" && (p.team === 0 || p.team === 1)) gift[1 - p.team] += 4;
      force.set(p.id, 0);
      continue;
    }
    const base = 8 + 8 * speedOf(p, ctx.limitMs) + (p.streak >= 3 ? 3 : 0);
    if (t === "anchor" && (p.team === 0 || p.team === 1)) anchors[p.team]++;
    force.set(p.id, base * (t === "jerk" ? 1.8 : t === "anchor" ? 0.6 : 1));
  }
  // Jamoa kuchi — a'zolar o'rtachasi (kichik jamoa zarar ko'rmasin); "mahkam turganlar" raqib kuchini kamaytiradi
  const avg = [0, 1].map((t) => {
    const m = members(t);
    return m.length ? m.reduce((s, p) => s + (force.get(p.id) ?? 0), 0) / m.length + gift[t] / m.length : 0;
  });
  const damp = [0, 1].map((t) => {
    const m = members(1 - t).length || 1;
    return 1 - Math.min(0.45, (0.5 * anchors[1 - t]) / m);
  });
  const pullA = avg[0] * damp[0];
  const pullB = avg[1] * damp[1];
  let rope = (cells[0] ?? 0) + Math.round((pullB - pullA) * 4);
  let winner = -1;
  if (rope <= -ROPE_WIN) winner = 0;
  else if (rope >= ROPE_WIN) winner = 1;
  if (winner >= 0) {
    cells[1 + winner] = (cells[1 + winner] ?? 0) + 1;
    rope = 0;
    events.push(`🪢 ${teamName(winner)} arqonni tortib oldi! (${cells[1]}:${cells[2]})`);
  } else if (Math.abs(rope) >= 60) events.push(`🪢 ${rope < 0 ? teamName(0) : teamName(1)} g'alabaga yaqin!`);
  cells[0] = Math.max(-ROPE_WIN, Math.min(ROPE_WIN, rope));
  const out: AdvOut[] = players.map((p) => {
    const f = force.get(p.id) ?? 0;
    const t = tacticOf("tug", p);
    const bonus = winner >= 0 && p.team === winner ? ROPE_BONUS : 0;
    const delta = Math.round(f * 10) + bonus;
    const effect = !p.correct
      ? fx("stall", t === "jerk" ? "Sirpanib ketdingiz — raqibga yordam 😬" : "Bu safar tortolmadingiz", 0, t === "jerk" ? ["💦"] : [])
      : fx("move", `${t === "jerk" ? "🔥 Siltash" : t === "anchor" ? "🦶 Mahkam" : "💪"} +${Math.round(f)} kuch${bonus ? ` · g'alaba +${bonus}` : ""}`, delta, [t === "jerk" ? "🔥" : t === "anchor" ? "🦶" : "💪"]);
    return { id: p.id, score: p.score + delta, progress: p.progress + Math.round(f), finished: false, effect };
  });
  return { out, cells, events };
}

function revealSiege(players: TeamAdvPlayer[], cells: number[], ctx: TeamAdvContext, teams: number, members: (t: number) => TeamAdvPlayer[], avgSize: number): AdvResult {
  const events: string[] = [];
  const k = (t: number) => avgSize / Math.max(1, members(t).length);
  const shielders = Array.from({ length: teams }, (_, t) => members(t).filter((p) => p.correct && tacticOf("siege", p) === "shield").length);
  const reduce = (t: number) => Math.min(0.6, (0.6 * shielders[t]) / Math.max(1, members(t).length));
  const before = [...cells];
  const dealt = new Map<string, number>();
  const healed = new Map<string, number>();
  const hitTeam = new Map<string, number>();
  const incoming = Array.from({ length: teams }, () => 0);
  // Avval hujumlar (qalqon hisobga olinadi), keyin ta'mir
  for (const p of players) {
    if (!p.correct || tacticOf("siege", p) !== "attack") continue;
    const alive = Array.from({ length: teams }, (_, t) => t).filter((t) => t !== p.team && (cells[t] ?? 0) > 0);
    const chosen = Number(p.target);
    const target = alive.includes(chosen) ? chosen : alive.sort((a, b) => (cells[b] ?? 0) - (cells[a] ?? 0))[0];
    if (target === undefined) continue;
    const dmg = (40 + 40 * speedOf(p, ctx.limitMs) + (p.streak >= 3 ? 15 : 0)) * k(p.team) * (1 - reduce(target));
    incoming[target] += dmg;
    dealt.set(p.id, dmg);
    hitTeam.set(p.id, target);
  }
  for (let t = 0; t < teams; t++) cells[t] = Math.max(0, Math.round((cells[t] ?? 0) - incoming[t]));
  for (const p of players) {
    if (!p.correct || tacticOf("siege", p) !== "repair") continue;
    const want = (25 + 25 * speedOf(p, ctx.limitMs)) * k(p.team);
    const got = Math.max(0, Math.min(CASTLE_HP - (cells[p.team] ?? 0), want));
    cells[p.team] = Math.round((cells[p.team] ?? 0) + got);
    healed.set(p.id, got);
  }
  for (let t = 0; t < teams; t++) {
    if ((before[t] ?? 0) > 0 && cells[t] === 0) events.push(`🏰💥 ${teamName(t)} qal'asi vayron bo'ldi!`);
    else if (incoming[t] >= 150) events.push(`🏹 ${teamName(t)} qal'asiga kuchli zarba: −${Math.round(incoming[t])} HP`);
    if (shielders[t] > 0 && incoming[t] > 0) events.push(`🛡️ ${teamName(t)} qalqoni zarbani ${Math.round(reduce(t) * 100)}% ga kamaytirdi`);
  }
  const out: AdvOut[] = players.map((p) => {
    const t = tacticOf("siege", p);
    if (!p.correct) return { id: p.id, score: p.score, progress: p.progress, finished: false, effect: fx("stall", "Bu safar hech narsa qilolmadingiz", 0) };
    if (t === "attack") {
      const d = Math.round(dealt.get(p.id) ?? 0);
      const to = hitTeam.get(p.id);
      return {
        id: p.id,
        score: p.score + d,
        progress: p.progress + d,
        finished: false,
        effect: fx("move", to === undefined ? "Nishon qolmadi" : `🏹 ${teamName(to)} qal'asiga −${d} HP`, d, ["🏹"]),
      };
    }
    if (t === "repair") {
      const h = Math.round(healed.get(p.id) ?? 0);
      return { id: p.id, score: p.score + h, progress: p.progress, finished: false, effect: fx("move", h > 0 ? `🧱 Qal'a +${h} HP` : "Qal'a butun — ta'mir kerak emas", h, ["🧱"]) };
    }
    return { id: p.id, score: p.score + 60, progress: p.progress, finished: false, effect: fx("defend", `🛡️ Qalqon: zarar −${Math.round(reduce(p.team) * 100)}%`, 60, ["🛡️"]) };
  });
  return { out, cells, events };
}

function revealFootball(players: TeamAdvPlayer[], cells: number[], ctx: TeamAdvContext, members: (t: number) => TeamAdvPlayer[]): AdvResult {
  const events: string[] = [];
  // Har jamoa darvozaboni — jamoa ko'p tanlagan burchakni qo'riqlaydi (teng bo'lsa — tasodifiy)
  const guard = [0, 1].map((t) => {
    const votes = new Map<string, number>(CORNERS.map((c) => [c, 0]));
    for (const p of members(t)) if (p.correct) votes.set(tacticOf("football", p), (votes.get(tacticOf("football", p)) ?? 0) + 1);
    const best = Math.max(...votes.values());
    const top = CORNERS.filter((c) => votes.get(c) === best);
    return best === 0 ? "center" : top[Math.floor(Math.min(0.999, ctx.rng()) * top.length)];
  });
  const goals = [0, 0];
  const saves = [0, 0];
  const result = new Map<string, "goal" | "saved" | "miss" | "cap">();
  const shooters = players.filter((p) => p.correct && (p.team === 0 || p.team === 1)).sort((a, b) => a.ms - b.ms);
  for (const p of shooters) {
    const opp = 1 - p.team;
    if (goals[p.team] >= MAX_GOALS_PER_ROUND) {
      result.set(p.id, "cap");
      continue;
    }
    const corner = tacticOf("football", p);
    const f = speedOf(p, ctx.limitMs);
    const guarded = corner === guard[opp];
    const chance = guarded ? 0.15 * f : 0.6 + 0.35 * f;
    if (ctx.rng() < chance) {
      goals[p.team]++;
      result.set(p.id, "goal");
    } else {
      result.set(p.id, guarded ? "saved" : "miss");
      if (guarded) saves[opp]++;
    }
  }
  cells[0] = (cells[0] ?? 0) + goals[0];
  cells[1] = (cells[1] ?? 0) + goals[1];
  for (const t of [0, 1]) if (goals[t] > 0) events.push(`⚽ ${teamName(t)}: ${goals[t]} ta GOL! (${cells[0]}:${cells[1]})`);
  for (const t of [0, 1]) if (saves[t] >= 2) events.push(`🧤 ${teamName(t)} darvozaboni ${saves[t]} ta zarbani qaytardi!`);
  const label = { left: "chap", center: "o'rta", right: "o'ng" } as Record<string, string>;
  const out: AdvOut[] = players.map((p) => {
    const r = result.get(p.id);
    const corner = label[tacticOf("football", p)];
    if (!p.correct) return { id: p.id, score: p.score, progress: p.progress, finished: false, effect: fx("stall", "To'pga tegolmadingiz", 0) };
    if (r === "goal") return { id: p.id, score: p.score + GOAL_POINTS, progress: p.progress + 1, finished: false, effect: fx("finish", `⚽ GOL! (${corner})`, GOAL_POINTS, ["⚽"]) };
    if (r === "saved") return { id: p.id, score: p.score + 40, progress: p.progress, finished: false, effect: fx("stall", `🧤 Darvozabon ${corner} burchakni qo'riqladi`, 40, ["🧤"]) };
    if (r === "cap") return { id: p.id, score: p.score + 40, progress: p.progress, finished: false, effect: fx("none", "Jamoangiz bu raund 3 ta gol urdi — navbat keyingisida", 40) };
    return { id: p.id, score: p.score + 40, progress: p.progress, finished: false, effect: fx("stall", `Darvoza yonidan o'tdi (${corner})`, 40, ["💨"]) };
  });
  // Darvozabon jamoasi qaytargan har zarba uchun a'zolariga ozgina ochko
  for (const o of out) {
    const p = players.find((x) => x.id === o.id)!;
    if ((p.team === 0 || p.team === 1) && saves[p.team] > 0) {
      const bonus = saves[p.team] * 30;
      o.score += bonus;
      o.effect = { ...o.effect, delta: o.effect.delta + bonus, text: `${o.effect.text} · 🧤 +${bonus}` };
    }
  }
  return { out, cells, events };
}

function revealIsland(players: TeamAdvPlayer[], cells: number[], ctx: TeamAdvContext, teams: number, members: (t: number) => TeamAdvPlayer[]): AdvResult {
  const events: string[] = [];
  const dice = new Map<string, number>();
  const extra = new Map<number, number>();
  let finishedBefore = cells.slice(4, 8).filter((x) => x > 0).length;
  const teamDelta = new Map<number, number>();
  const teamNote = new Map<number, string>();
  for (let t = 0; t < teams; t++) {
    const m = members(t);
    if (m.length === 0 || cells[4 + t] > 0) continue;
    let sum = 0;
    let compass = false;
    let penalty = 0;
    for (const p of m) {
      const tac = tacticOf("island", p);
      if (!p.correct) {
        if (tac === "leap") penalty += 1;
        dice.set(p.id, 0);
        continue;
      }
      let d = 1 + Math.round(2 * speedOf(p, ctx.limitMs)) + (p.streak >= 3 ? 1 : 0);
      if (tac === "leap") d *= 2;
      if (tac === "compass") {
        d = Math.max(1, Math.round(d * 0.7));
        compass = true;
      }
      dice.set(p.id, d);
      sum += d;
    }
    const move = Math.round((sum / m.length) * 1.6) - Math.round(penalty / Math.max(1, m.length / 2));
    let pos = Math.max(0, Math.min(ISLAND_LEN, cells[t] + move));
    let note = move > 0 ? `+${move} qadam` : move < 0 ? `${move} qadam (tavakkal)` : "joyida";
    let bonus = 0;
    const cell = ISLAND_BOARD[pos];
    if (pos < ISLAND_LEN && cell === "palm") {
      pos = Math.min(ISLAND_LEN, pos + 4);
      note += " · 🌴 palma +4";
      events.push(`🌴 ${teamName(t)} palmadan sakrab oldinga ketdi!`);
    } else if (pos < ISLAND_LEN && cell === "croc") {
      if (compass) {
        note += " · 🧭 timsohdan qochdi";
        events.push(`🧭 ${teamName(t)} kompas bilan timsohni chetlab o'tdi`);
      } else {
        pos = Math.max(0, pos - 3);
        note += " · 🐊 timsoh −3";
        events.push(`🐊 ${teamName(t)}ni timsoh orqaga quvdi!`);
      }
    } else if (pos < ISLAND_LEN && cell === "chest") {
      bonus += 200;
      note += " · 💰 sandiq +200";
      events.push(`💰 ${teamName(t)} sandiq topdi!`);
    }
    if (pos >= ISLAND_LEN) {
      pos = ISLAND_LEN;
      finishedBefore++;
      cells[4 + t] = finishedBefore;
      bonus += ISLAND_FINISH_BONUS[finishedBefore - 1] ?? 0;
      note += ` · 🏆 xazina! ${finishedBefore}-o'rin`;
      events.push(`🏆 ${teamName(t)} xazinaga ${finishedBefore}-bo'lib yetdi!`);
    }
    cells[t] = pos;
    extra.set(t, bonus);
    teamDelta.set(t, pos);
    teamNote.set(t, note);
  }
  const out: AdvOut[] = players.map((p) => {
    const d = dice.get(p.id) ?? 0;
    const bonus = extra.get(p.team) ?? 0;
    const delta = d * 60 + bonus;
    const note = teamNote.get(p.team) ?? "Jamoangiz xazinada 🏆";
    const tac = tacticOf("island", p);
    const effect = !p.correct
      ? fx("stall", `${tac === "leap" ? "🦘 Tavakkal oqlanmadi · " : ""}Jamoa: ${note}`, bonus, [])
      : fx("move", `🎲 ${d} · Jamoa: ${note}`, delta, [tac === "leap" ? "🦘" : tac === "compass" ? "🧭" : "🎲"]);
    return { id: p.id, score: p.score + delta, progress: cells[p.team] ?? 0, finished: (cells[4 + p.team] ?? 0) > 0, effect };
  });
  return { out, cells, events };
}
