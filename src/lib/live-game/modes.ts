import { answerPoints } from "@/lib/quiz-game";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";

// Jonli o'yin turlarining qoidalari — sof funksiyalar (server ham, test ham shu yerdan foydalanadi).
// Bu fayl brauzerda ham ishlatiladi (qoida matnlari), shuning uchun serverga bog'liq emas.

export const LIVE_MODES: Record<LiveGameMode, { title: string; tagline: string; rules: string[] }> = {
  classic: {
    title: "Klassik",
    tagline: "Tez va to'g'ri — ko'proq ochko",
    rules: ["Tez javob — 500–1000 ochko", "Ketma-ket to'g'ri — +100…+500 bonus", "Eng ko'p ochko yig'gan yutadi"],
  },
  survival: {
    title: "Omon qolish",
    tagline: "3 ta jon — xato qilsang, kamayadi",
    rules: ["Har kimda 3 ta jon", "Xato yoki javobsiz qolish — bitta jon ketadi", "Oxirigacha omon qolganlar yutadi"],
  },
  chest: {
    title: "Xazina sandig'i",
    tagline: "Har to'g'ri javob — bitta sandiq",
    rules: ["To'g'ri javob — +300 ochko va sandiq", "Sandiqdan: ochko, ×2, qalqon yoki o'g'irlash", "Ko'p to'g'ri javob — ko'p imkoniyat"],
  },
  team: {
    title: "Jamoaviy jang",
    tagline: "Jamoa bo'lib yutamiz",
    rules: ["O'quvchilar jamoalarga bo'linadi", "Har to'g'ri javob jamoaga ochko qo'shadi", "Jamoa ochkosi — a'zolar o'rtachasi"],
  },
};

export const TEAM_NAMES = ["Qizillar", "Ko'klar", "Sariqlar", "Yashillar"];
export const SURVIVAL_LIVES = 3;
export const CHEST_CORRECT_POINTS = 300;
/** Javob yuborilishidagi tarmoq kechikishi uchun qo'shimcha vaqt */
export const LIVE_GRACE_MS = 1500;

export interface PlayerLike {
  score: number;
  streak: number;
  lives: number;
  eliminated: boolean;
  double: boolean;
}

export interface AnswerOutcome {
  points: number;
  streak: number;
  lives: number;
  eliminated: boolean;
  chests: number;
  double: boolean;
}

/** Javobning ta'siri tanlangan o'yin turiga qarab */
export function scoreAnswer(
  mode: LiveGameMode,
  player: PlayerLike,
  a: { isCorrect: boolean; elapsedMs: number; limitSec: number; /** Bonus raund: ochko ×2 */ bonus?: boolean }
): AnswerOutcome {
  const streak = a.isCorrect ? player.streak + 1 : 0;
  const base = { points: 0, streak, lives: player.lives, eliminated: player.eliminated, chests: 0, double: player.double };
  // ×2 (sandiq yoki omad g'ildiragidan) keyingi to'g'ri javobda ishlatiladi; bonus raund bilan qo'shiladi
  const mult = (a.isCorrect && player.double ? 2 : 1) * (a.bonus ? 2 : 1);
  if (mode === "chest") {
    if (!a.isCorrect) return base;
    return { ...base, points: CHEST_CORRECT_POINTS * mult, chests: 1, double: false };
  }
  const pts = answerPoints({ isCorrect: a.isCorrect, elapsedMs: a.elapsedMs, limitSec: a.limitSec, streak }).total * mult;
  if (mode === "survival" && !a.isCorrect) {
    const lives = Math.max(player.lives - 1, 0);
    return { ...base, lives, eliminated: lives === 0 };
  }
  return { ...base, points: pts, double: a.isCorrect ? false : player.double };
}

/** Javob bermay qolgan o'yinchi: xato bilan teng */
export function missedAnswer(mode: LiveGameMode, player: PlayerLike): AnswerOutcome {
  return scoreAnswer(mode, player, { isCorrect: false, elapsedMs: 0, limitSec: 1 });
}

export type ChestKind = "points" | "double" | "shield" | "steal" | "empty";

const CHEST_TABLE: { kind: ChestKind; amount: number; weight: number }[] = [
  { kind: "points", amount: 200, weight: 28 },
  { kind: "points", amount: 500, weight: 20 },
  { kind: "points", amount: 1000, weight: 8 },
  { kind: "double", amount: 0, weight: 12 },
  { kind: "shield", amount: 0, weight: 10 },
  { kind: "steal", amount: 15, weight: 14 },
  { kind: "empty", amount: 0, weight: 8 },
];

/** Sandiq natijasi (rng — 0..1; testda aniq qiymat beriladi) */
export function rollChest(rng: number = Math.random()): { kind: ChestKind; amount: number } {
  const total = CHEST_TABLE.reduce((s, c) => s + c.weight, 0);
  let x = Math.min(Math.max(rng, 0), 0.999999) * total;
  for (const c of CHEST_TABLE) {
    if (x < c.weight) return { kind: c.kind, amount: c.amount };
    x -= c.weight;
  }
  return { kind: "empty", amount: 0 };
}

/** O'g'irlash: eng ko'p ochkoli, qalqonsiz raqibdan foizi */
export function stealAmount(targetScore: number, percent: number): number {
  return Math.max(0, Math.floor((targetScore * percent) / 100));
}

/** Qo'shilish tartibida jamoalarga teng taqsimlash */
export function assignTeam(teamSizes: number[]): number {
  let best = 0;
  for (let i = 1; i < teamSizes.length; i++) if (teamSizes[i] < teamSizes[best]) best = i;
  return best;
}

export interface RankablePlayer {
  id: string;
  score: number;
  eliminated: boolean;
  eliminatedAt?: number | null;
  team: number;
  /** Qo'shilgan vaqti (teng bo'lsa oldin qo'shilgan yuqorida) */
  joinedAt: number;
}

/** O'yinchilar tartibi: survival'da avval omon qolganlar, keyin kechroq chiqqanlar */
export function rankPlayers<T extends RankablePlayer>(mode: LiveGameMode, players: T[]): T[] {
  return [...players].sort((a, b) => {
    if (mode === "survival" && a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (mode === "survival" && a.eliminated && b.eliminated && (a.eliminatedAt ?? 0) !== (b.eliminatedAt ?? 0)) {
      return (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
    }
    return b.score - a.score || a.joinedAt - b.joinedAt;
  });
}

/** Jamoalar: o'rtacha ochko (kichik jamoa zarar ko'rmasin) */
export function teamStandings(players: { team: number; score: number }[], teams: number) {
  return Array.from({ length: teams }, (_, t) => {
    const members = players.filter((p) => p.team === t);
    const total = members.reduce((s, p) => s + p.score, 0);
    return { team: t, name: TEAM_NAMES[t], members: members.length, total, average: members.length ? Math.round(total / members.length) : 0 };
  }).sort((a, b) => b.average - a.average || b.members - a.members);
}

/** Yakunda kimga qancha coin: 1–3 o'rin, jamoaviyda g'olib jamoaning har a'zosi 1-o'rin mukofotini oladi */
export function computeAwards<T extends RankablePlayer>(
  mode: LiveGameMode,
  players: T[],
  prizes: number[],
  teams: number
): { id: string; place: number; coins: number }[] {
  const played = players.filter((p) => p.score > 0 || (mode === "survival" && !p.eliminated));
  if (mode === "team") {
    const standings = teamStandings(played, teams);
    const winner = standings.find((s) => s.members > 0 && s.average > 0);
    if (!winner) return [];
    return played.filter((p) => p.team === winner.team).map((p) => ({ id: p.id, place: 1, coins: prizes[0] ?? 0 }));
  }
  return rankPlayers(mode, played)
    .slice(0, prizes.length)
    .map((p, i) => ({ id: p.id, place: i + 1, coins: prizes[i] ?? 0 }))
    .filter((a) => a.coins > 0);
}
