"use server";

import mongoose from "mongoose";
import { unstable_rethrow } from "next/navigation";
import { connectDB } from "@/lib/db/connect";
import { LiveGame, type ILiveGame, type LiveGameMode, type LiveGameSource, type LiveGameStatus, type LiveQuestionType } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer, type ILiveGamePlayer } from "@/lib/db/models/live-game-player.model";
import { Group } from "@/lib/db/models/group.model";
import { User } from "@/lib/db/models/user.model";
import { getCurrentUser, requireMentor, requireStudent } from "@/lib/auth/guards";
import { autoGradeQuiz } from "@/lib/grading";
import { countLiveQuestions, pickQuestions } from "@/lib/live-game/questions";
import {
  LIVE_GRACE_MS,
  SURVIVAL_LIVES,
  TEAM_NAMES,
  assignTeam,
  missedAnswer,
  rankPlayers,
  rollChest,
  scoreAnswer,
  stealAmount,
  teamStandings,
} from "@/lib/live-game/modes";
import { LIVE_GAME_MAX_MS, finishLiveGame } from "@/lib/live-game/finish";

// Jonli o'yin: mentor proyektorda boshqaradi, o'quvchilar telefondan qo'shiladi. Holat qisqa so'rovlar bilan olinadi.

type Result<T> = { success: true; data: T } | { success: false; error: string };
const fail = (error: string): { success: false; error: string } => ({ success: false, error });
const MODES: LiveGameMode[] = ["classic", "survival", "chest", "team"];
const SOURCES: LiveGameSource[] = ["today", "all"];
const COUNTS = [5, 10, 15, 20];

function errorOf(err: unknown, fallback: string) {
  unstable_rethrow(err);
  return fail(err instanceof Error ? err.message : fallback);
}

function remainingOf(game: Pick<ILiveGame, "status" | "questionStartedAt" | "questions" | "index">): number {
  if (game.status !== "question" || !game.questionStartedAt) return 0;
  const limit = game.questions[game.index]?.timeLimit ?? 20;
  return Math.max(0, limit * 1000 - (Date.now() - new Date(game.questionStartedAt).getTime()));
}

const activeFilter = () => ({ status: { $ne: "finished" as LiveGameStatus }, createdAt: { $gt: new Date(Date.now() - LIVE_GAME_MAX_MS) } });

// ---------------- Mentor ----------------

export interface LiveGroupOption {
  id: string;
  name: string;
  today: number;
  all: number;
  activeGameId: string | null;
}

/** Yaratish oynasi uchun: guruhlar va har birida nechta yaroqli savol bor */
export async function getLiveGameSetupAction(): Promise<Result<{ groups: LiveGroupOption[] }>> {
  try {
    await requireMentor();
    await connectDB();
    const groups = await Group.find({ isActive: { $ne: false } }).select("name").sort({ name: 1 }).lean();
    const active = await LiveGame.find({ ...activeFilter(), groupId: { $in: groups.map((g) => g._id) } }).select("groupId").lean();
    const activeOf = new Map(active.map((g) => [g.groupId.toString(), g._id.toString()]));
    const data = await Promise.all(
      groups.map(async (g) => ({
        id: g._id.toString(),
        name: g.name,
        today: await countLiveQuestions(g._id, "today"),
        all: await countLiveQuestions(g._id, "all"),
        activeGameId: activeOf.get(g._id.toString()) ?? null,
      }))
    );
    return { success: true, data: { groups: data } };
  } catch (err) {
    return errorOf(err, "Ma'lumotlarni olib bo'lmadi");
  }
}

export async function createLiveGameAction(input: {
  groupId: string;
  mode: LiveGameMode;
  source: LiveGameSource;
  count: number;
  teams?: number;
  prizes?: number[];
}): Promise<Result<{ gameId: string; existing: boolean }>> {
  try {
    const mentor = await requireMentor();
    if (!mongoose.isValidObjectId(input?.groupId) || !MODES.includes(input.mode) || !SOURCES.includes(input.source)) {
      return fail("Ma'lumotlar noto'g'ri");
    }
    const count = COUNTS.includes(Number(input.count)) ? Number(input.count) : 10;
    const teams = Math.min(4, Math.max(2, Math.round(Number(input.teams) || 2)));
    const prizes = (Array.isArray(input.prizes) ? input.prizes : [30, 20, 10])
      .slice(0, 3)
      .map((n) => Math.min(500, Math.max(0, Math.round(Number(n) || 0))));
    await connectDB();
    const group = await Group.findById(input.groupId).select("_id").lean();
    if (!group) return fail("Guruh topilmadi");

    const existing = await LiveGame.findOne({ ...activeFilter(), groupId: group._id }).select("_id").lean();
    if (existing) return { success: true, data: { gameId: existing._id.toString(), existing: true } };

    const questions = await pickQuestions(group._id, input.source, count);
    if (questions.length === 0) {
      return fail(input.source === "today" ? "Bugungi darsda test savollari yo'q" : "Guruh darslarida test savollari yo'q");
    }
    const game = await LiveGame.create({
      mentorId: mentor.userId,
      groupId: group._id,
      mode: input.mode,
      source: input.source,
      teams,
      prizes,
      questions,
    });
    return { success: true, data: { gameId: game._id.toString(), existing: false } };
  } catch (err) {
    return errorOf(err, "O'yinni yaratib bo'lmadi");
  }
}

/** Keyingi savol (lobby yoki natijadan keyin). Oxirgi savoldan keyin chaqirilsa — o'yin yakunlanadi */
export async function startLiveQuestionAction(gameId: string): Promise<Result<{ finished: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await LiveGame.findById(gameId).select("status index questions").lean();
    if (!game || game.status === "finished") return fail("O'yin topilmadi yoki yakunlangan");
    if (game.status === "question") return { success: true, data: { finished: false } };
    const next = game.index + 1;
    if (next >= game.questions.length) {
      await finishLiveGame(game._id);
      return { success: true, data: { finished: true } };
    }
    await LiveGame.updateOne(
      { _id: game._id, index: game.index, status: game.status },
      { $set: { status: "question", index: next, questionStartedAt: new Date() } }
    );
    return { success: true, data: { finished: false } };
  } catch (err) {
    return errorOf(err, "Savolni boshlab bo'lmadi");
  }
}

/** Savol yopiladi: to'g'ri javob ochiladi, javob bermaganlar xato deb hisoblanadi */
export async function revealLiveQuestionAction(gameId: string): Promise<Result<{ revealed: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await LiveGame.findOneAndUpdate(
      { _id: gameId, status: "question" },
      { $set: { status: "reveal", questionStartedAt: null } },
      { returnDocument: "after" }
    );
    if (!game) return { success: true, data: { revealed: false } };

    const missing = await LiveGamePlayer.find({ gameId: game._id, eliminated: false, "answers.index": { $ne: game.index } });
    const outs: string[] = [];
    for (const p of missing) {
      const o = missedAnswer(game.mode, p);
      const res = await LiveGamePlayer.updateOne(
        { _id: p._id, "answers.index": { $ne: game.index } },
        {
          $push: { answers: { index: game.index, value: "", isCorrect: false, ms: 0, points: 0 } },
          $set: { streak: 0, lives: o.lives, eliminated: o.eliminated, ...(o.eliminated ? { eliminatedAt: game.index } : {}) },
        }
      );
      if (res.modifiedCount > 0 && o.eliminated) outs.push(p.name);
    }
    if (outs.length > 0) await pushEvents(game._id, outs.map((n) => ({ text: `${n} o'yindan chiqdi`, kind: "out" as const })));
    return { success: true, data: { revealed: true } };
  } catch (err) {
    return errorOf(err, "Natijani ochib bo'lmadi");
  }
}

export async function finishLiveGameAction(gameId: string): Promise<Result<{ finished: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { finished: await finishLiveGame(gameId) } };
  } catch (err) {
    return errorOf(err, "O'yinni yakunlab bo'lmadi");
  }
}

/** Boshlanmagan o'yinni bekor qilish (coin berilmaydi) */
export async function cancelLiveGameAction(gameId: string): Promise<Result<{ cancelled: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const res = await LiveGame.updateOne(
      { _id: gameId, status: { $ne: "finished" } },
      { $set: { status: "finished", finishedAt: new Date(), rewardedAt: new Date(), questionStartedAt: null } }
    );
    return { success: true, data: { cancelled: res.modifiedCount > 0 } };
  } catch (err) {
    return errorOf(err, "Bekor qilib bo'lmadi");
  }
}

async function pushEvents(gameId: mongoose.Types.ObjectId, events: { text: string; kind: ILiveGame["events"][number]["kind"] }[]) {
  await LiveGame.updateOne(
    { _id: gameId },
    { $push: { events: { $each: events.map((e) => ({ ...e, at: new Date() })), $slice: -20 } } }
  );
}

export interface LivePlayerRow {
  id: string;
  name: string;
  score: number;
  lives: number;
  eliminated: boolean;
  team: number;
  answered: boolean;
  /** Natija paytida: shu savolda olingan ochko */
  lastPoints: number;
  lastCorrect: boolean | null;
  coins: number;
}

export interface LiveQuestionView {
  prompt: string;
  type: LiveQuestionType;
  options: string[];
  timeLimit: number;
}

export interface LiveHostState {
  id: string;
  mode: LiveGameMode;
  status: LiveGameStatus;
  index: number;
  total: number;
  teams: number;
  prizes: number[];
  groupName: string;
  remainingMs: number;
  question: LiveQuestionView | null;
  /** Faqat natija paytida */
  correctAnswers: string[];
  distribution: { option: string; count: number; correct: boolean }[];
  correctCount: number;
  answeredCount: number;
  activeCount: number;
  players: LivePlayerRow[];
  standings: ReturnType<typeof teamStandings>;
  events: { text: string; kind: string }[];
}

const toRows = (players: ILiveGamePlayer[], mode: LiveGameMode, index: number): LivePlayerRow[] =>
  rankPlayers(
    mode,
    players.map((p) => ({ p, id: p._id.toString(), score: p.score, eliminated: p.eliminated, eliminatedAt: p.eliminatedAt, team: p.team, joinedAt: new Date(p.createdAt ?? 0).getTime() }))
  ).map(({ p }) => {
    const ans = p.answers.find((a) => a.index === index);
    return {
      id: p._id.toString(),
      name: p.name,
      score: p.score,
      lives: p.lives,
      eliminated: p.eliminated,
      team: p.team,
      answered: Boolean(ans),
      lastPoints: ans?.points ?? 0,
      lastCorrect: ans ? ans.isCorrect : null,
      coins: p.coins ?? 0,
    };
  });

export async function getLiveHostStateAction(gameId: string): Promise<Result<LiveHostState>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await LiveGame.findById(gameId).lean();
    if (!game) return fail("O'yin topilmadi");
    const [players, group] = await Promise.all([
      LiveGamePlayer.find({ gameId: game._id }),
      Group.findById(game.groupId).select("name").lean(),
    ]);
    const q = game.index >= 0 ? game.questions[game.index] : null;
    const revealed = game.status === "reveal" || game.status === "finished";
    const answersNow = players.map((p) => p.answers.find((a) => a.index === game.index)).filter(Boolean);
    const distribution =
      q && revealed && q.type !== "short_answer"
        ? q.options.map((option) => ({
            option,
            count: answersNow.filter((a) => (Array.isArray(a!.value) ? a!.value.includes(option) : a!.value === option)).length,
            correct: q.correctAnswers.includes(option),
          }))
        : [];
    return {
      success: true,
      data: {
        id: game._id.toString(),
        mode: game.mode,
        status: game.status,
        index: game.index,
        total: game.questions.length,
        teams: game.teams,
        prizes: game.prizes,
        groupName: group?.name ?? "",
        remainingMs: remainingOf(game),
        question: q ? { prompt: q.prompt, type: q.type, options: q.options, timeLimit: q.timeLimit } : null,
        correctAnswers: q && revealed ? q.correctAnswers : [],
        distribution,
        correctCount: answersNow.filter((a) => a!.isCorrect).length,
        answeredCount: answersNow.filter((a) => a!.value !== "" && !(Array.isArray(a!.value) && a!.value.length === 0)).length,
        activeCount: players.filter((p) => !p.eliminated || p.eliminatedAt === game.index).length,
        players: toRows(players, game.mode, game.index),
        standings: game.mode === "team" ? teamStandings(players, game.teams) : [],
        events: [...game.events].reverse().slice(0, 8).map((e) => ({ text: e.text, kind: e.kind })),
      },
    };
  } catch (err) {
    return errorOf(err, "Holatni olib bo'lmadi");
  }
}

export interface LiveGameListItem {
  id: string;
  groupName: string;
  mode: LiveGameMode;
  status: LiveGameStatus;
  players: number;
  questions: number;
  createdAt: string;
  winner: string | null;
}

export async function getLiveGamesForMentorAction(): Promise<Result<LiveGameListItem[]>> {
  try {
    await requireMentor();
    await connectDB();
    const games = await LiveGame.find({}).select("groupId mode status questions createdAt").sort({ createdAt: -1 }).limit(15).lean();
    const [groups, counts, winners] = await Promise.all([
      Group.find({ _id: { $in: games.map((g) => g.groupId) } }).select("name").lean(),
      LiveGamePlayer.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
        { $match: { gameId: { $in: games.map((g) => g._id) } } },
        { $group: { _id: "$gameId", n: { $sum: 1 } } },
      ]),
      LiveGamePlayer.find({ gameId: { $in: games.map((g) => g._id) }, coins: { $gt: 0 } }).select("gameId name coins").sort({ coins: -1 }).lean(),
    ]);
    const nameOf = new Map(groups.map((g) => [g._id.toString(), g.name]));
    const countOf = new Map(counts.map((c) => [c._id.toString(), c.n]));
    return {
      success: true,
      data: games.map((g) => ({
        id: g._id.toString(),
        groupName: nameOf.get(g.groupId.toString()) ?? "",
        mode: g.mode,
        status: g.status === "finished" || new Date(g.createdAt ?? 0).getTime() < Date.now() - LIVE_GAME_MAX_MS ? "finished" : g.status,
        players: countOf.get(g._id.toString()) ?? 0,
        questions: g.questions.length,
        createdAt: new Date(g.createdAt ?? 0).toISOString(),
        winner: winners.find((w) => w.gameId.toString() === g._id.toString())?.name ?? null,
      })),
    };
  } catch (err) {
    return errorOf(err, "Ro'yxatni olib bo'lmadi");
  }
}

// ---------------- O'quvchi ----------------

async function loadGameForStudent(gameId: unknown, groupId: string | null | undefined) {
  if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return null;
  const game = await LiveGame.findById(gameId).lean();
  if (!game || game.groupId.toString() !== String(groupId ?? "")) return null;
  return game;
}

/** Header va xabar oynasi: o'z guruhida faol o'yin bormi */
export async function getMyActiveLiveGameAction(): Promise<{ id: string; mode: LiveGameMode; status: LiveGameStatus; joined: boolean } | null> {
  const user = await getCurrentUser();
  if (user?.role !== "student" || !user.groupId) return null;
  await connectDB();
  const game = await LiveGame.findOne({ ...activeFilter(), groupId: user.groupId }).select("mode status").sort({ createdAt: -1 }).lean();
  if (!game) return null;
  const joined = Boolean(await LiveGamePlayer.exists({ gameId: game._id, studentId: user.userId }));
  return { id: game._id.toString(), mode: game.mode, status: game.status, joined };
}

export async function joinLiveGameAction(gameId: string): Promise<Result<{ joined: boolean }>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game || game.status === "finished") return fail("O'yin topilmadi yoki yakunlangan");
    const exists = await LiveGamePlayer.exists({ gameId: game._id, studentId: user.userId });
    if (exists) return { success: true, data: { joined: true } };

    const me = await User.findById(user.userId).select("fullName").lean();
    let team = 0;
    if (game.mode === "team") {
      const sizes = await LiveGamePlayer.aggregate<{ _id: number; n: number }>([
        { $match: { gameId: game._id } },
        { $group: { _id: "$team", n: { $sum: 1 } } },
      ]);
      team = assignTeam(Array.from({ length: game.teams }, (_, t) => sizes.find((s) => s._id === t)?.n ?? 0));
    }
    await LiveGamePlayer.init();
    try {
      await LiveGamePlayer.create({
        gameId: game._id,
        studentId: user.userId,
        name: me?.fullName ?? user.fullName,
        team,
        // Omon qolishda kech qo'shilgan bitta jon bilan kiradi
        lives: game.mode === "survival" && game.index >= 0 ? 1 : SURVIVAL_LIVES,
      });
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
    return { success: true, data: { joined: true } };
  } catch (err) {
    return errorOf(err, "Qo'shilib bo'lmadi");
  }
}

function cleanValue(value: unknown): string | string[] {
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").slice(0, 20).map((v) => v.slice(0, 500));
  return "";
}

export async function answerLiveQuestionAction(gameId: string, index: number, value: unknown): Promise<Result<{ accepted: boolean }>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game || game.status !== "question" || game.index !== index || !game.questionStartedAt) return fail("Bu savolga hozir javob berib bo'lmaydi");
    const q = game.questions[index];
    const elapsed = Date.now() - new Date(game.questionStartedAt).getTime();
    if (elapsed > q.timeLimit * 1000 + LIVE_GRACE_MS) return fail("Vaqt tugadi");

    const player = await LiveGamePlayer.findOne({ gameId: game._id, studentId: user.userId });
    if (!player) return fail("Avval o'yinga qo'shiling");
    if (player.eliminated) return fail("Siz o'yindan chiqqansiz");
    if (player.answers.some((a) => a.index === index)) return fail("Bu savolga javob berdingiz");

    const clean = cleanValue(value);
    const graded = autoGradeQuiz({
      questions: [{ _id: "q", type: q.type, prompt: q.prompt, options: q.options, correctAnswers: q.correctAnswers, points: 1 }],
      submittedAnswers: [{ questionId: "q", value: clean }],
    });
    const isCorrect = Boolean(graded.answers[0]?.isCorrect);
    const o = scoreAnswer(game.mode, player, { isCorrect, elapsedMs: elapsed, limitSec: q.timeLimit });

    // Shartli: bitta savolga ikki marta javob yozilmaydi
    const res = await LiveGamePlayer.updateOne(
      { _id: player._id, "answers.index": { $ne: index }, eliminated: false },
      {
        $push: { answers: { index, value: clean, isCorrect, ms: Math.min(elapsed, q.timeLimit * 1000), points: o.points } },
        $inc: { score: o.points, chests: o.chests },
        $set: { streak: o.streak, lives: o.lives, eliminated: o.eliminated, double: o.double, ...(o.eliminated ? { eliminatedAt: index } : {}) },
      }
    );
    if (res.modifiedCount === 0) return fail("Bu savolga javob berdingiz");
    if (o.eliminated) await pushEvents(game._id, [{ text: `${player.name} o'yindan chiqdi`, kind: "out" }]);
    return { success: true, data: { accepted: true } };
  } catch (err) {
    return errorOf(err, "Javobni yuborib bo'lmadi");
  }
}

/** Xazina sandig'ini ochish: natija serverda tasodifiy tanlanadi */
export async function openLiveChestAction(gameId: string): Promise<Result<{ kind: string; amount: number; text: string }>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game || game.mode !== "chest" || game.status === "finished") return fail("Sandiq ochib bo'lmaydi");
    // Sandiqni olish shartli: ikki marta bosilsa ham bitta sandiq ochiladi
    const me = await LiveGamePlayer.findOneAndUpdate(
      { gameId: game._id, studentId: user.userId, chests: { $gt: 0 } },
      { $inc: { chests: -1 } },
      { returnDocument: "after" }
    );
    if (!me) return fail("Ochilmagan sandiq yo'q");

    let roll = rollChest();
    let text = "";
    let amount = roll.amount;
    if (roll.kind === "steal") {
      const target = await LiveGamePlayer.findOne({ gameId: game._id, _id: { $ne: me._id }, score: { $gt: 0 } }).sort({ score: -1 });
      if (!target) {
        roll = { kind: "points", amount: 200 };
        amount = 200;
      } else if (target.shield) {
        await LiveGamePlayer.updateOne({ _id: target._id }, { $set: { shield: false } });
        amount = 0;
        text = `${target.name}ning qalqoni hujumni qaytardi!`;
        await pushEvents(game._id, [{ text: `${me.name} hujum qildi, lekin ${target.name}ning qalqoni qaytardi`, kind: "shield" }]);
      } else {
        amount = stealAmount(target.score, roll.amount);
        await LiveGamePlayer.updateOne({ _id: target._id }, { $inc: { score: -amount } });
        await LiveGamePlayer.updateOne({ _id: me._id }, { $inc: { score: amount } });
        text = `${target.name}dan ${amount} ochko o'g'irladingiz!`;
        await pushEvents(game._id, [{ text: `${me.name} ${target.name}dan ${amount} ochko o'g'irladi!`, kind: "steal" }]);
      }
    }
    if (roll.kind === "points") {
      await LiveGamePlayer.updateOne({ _id: me._id }, { $inc: { score: amount } });
      text = `+${amount} ochko!`;
      if (amount >= 1000) await pushEvents(game._id, [{ text: `${me.name} sandiqdan +${amount} ochko topdi!`, kind: "chest" }]);
    } else if (roll.kind === "double") {
      await LiveGamePlayer.updateOne({ _id: me._id }, { $set: { double: true } });
      text = "Keyingi to'g'ri javob ×2!";
    } else if (roll.kind === "shield") {
      await LiveGamePlayer.updateOne({ _id: me._id }, { $set: { shield: true } });
      text = "Qalqon: keyingi o'g'irlashdan himoya";
    } else if (roll.kind === "empty") {
      text = "Sandiq bo'sh chiqdi…";
    }
    const result = { kind: roll.kind, amount, text };
    await LiveGamePlayer.updateOne({ _id: me._id }, { $set: { lastChest: result } });
    return { success: true, data: result };
  } catch (err) {
    return errorOf(err, "Sandiqni ochib bo'lmadi");
  }
}

export interface LivePlayerState {
  id: string;
  mode: LiveGameMode;
  status: LiveGameStatus;
  index: number;
  total: number;
  groupName: string;
  remainingMs: number;
  joined: boolean;
  question: LiveQuestionView | null;
  /** Faqat natija paytida */
  correctAnswers: string[];
  me: {
    name: string;
    score: number;
    rank: number;
    players: number;
    lives: number;
    eliminated: boolean;
    team: number;
    teamName: string;
    chests: number;
    shield: boolean;
    double: boolean;
    streak: number;
    coins: number;
    /** Joriy savolga javob */
    answered: boolean;
    value: string | string[] | null;
    /** Natija paytida */
    lastCorrect: boolean | null;
    lastPoints: number;
  } | null;
  standings: ReturnType<typeof teamStandings>;
  top: { name: string; score: number; coins: number }[];
}

export async function getLivePlayerStateAction(gameId: string): Promise<Result<LivePlayerState>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game) return fail("O'yin topilmadi");
    const [players, group] = await Promise.all([
      LiveGamePlayer.find({ gameId: game._id }),
      Group.findById(game.groupId).select("name").lean(),
    ]);
    const rows = toRows(players, game.mode, game.index);
    const mine = players.find((p) => p.studentId.toString() === user.userId);
    const q = game.index >= 0 ? game.questions[game.index] : null;
    const revealed = game.status === "reveal" || game.status === "finished";
    const ans = mine?.answers.find((a) => a.index === game.index);
    return {
      success: true,
      data: {
        id: game._id.toString(),
        mode: game.mode,
        status: game.status === "finished" || new Date(game.createdAt ?? 0).getTime() < Date.now() - LIVE_GAME_MAX_MS ? "finished" : game.status,
        index: game.index,
        total: game.questions.length,
        groupName: group?.name ?? "",
        remainingMs: remainingOf(game),
        joined: Boolean(mine),
        question: q ? { prompt: q.prompt, type: q.type, options: q.options, timeLimit: q.timeLimit } : null,
        correctAnswers: q && revealed ? q.correctAnswers : [],
        me: mine
          ? {
              name: mine.name,
              score: mine.score,
              rank: rows.findIndex((r) => r.id === mine._id.toString()) + 1,
              players: rows.length,
              lives: mine.lives,
              eliminated: mine.eliminated,
              team: mine.team,
              teamName: TEAM_NAMES[mine.team] ?? "",
              chests: mine.chests,
              shield: mine.shield,
              double: mine.double,
              streak: mine.streak,
              coins: mine.coins ?? 0,
              answered: Boolean(ans),
              value: ans ? ans.value : null,
              lastCorrect: revealed && ans ? ans.isCorrect : null,
              lastPoints: revealed && ans ? ans.points : 0,
            }
          : null,
        standings: game.mode === "team" ? teamStandings(players, game.teams) : [],
        top: game.status === "finished" ? rows.slice(0, 5).map((r) => ({ name: r.name, score: r.score, coins: r.coins })) : [],
      },
    };
  } catch (err) {
    return errorOf(err, "Holatni olib bo'lmadi");
  }
}
