"use server";

import mongoose from "mongoose";
import { unstable_rethrow } from "next/navigation";
import { connectDB } from "@/lib/db/connect";
import { LIVE_GAME_MODES, LiveGame, type ILiveGame, type LiveGameMode, type LiveGameSource, type LiveGameStatus, type LiveQuestionType } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer, type ILiveGamePlayer } from "@/lib/db/models/live-game-player.model";
import { Group } from "@/lib/db/models/group.model";
import { User } from "@/lib/db/models/user.model";
import { getCurrentUser, requireMentor, requireStudent } from "@/lib/auth/guards";
import { autoGradeQuiz } from "@/lib/grading";
import { countLiveQuestions, pickQuestions } from "@/lib/live-game/questions";
import { isValidSchedule, pickNearestLessonGroup } from "@/lib/schedule";
import {
  DEFAULT_PRIZES,
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
import {
  MINIGAMES,
  MINIGAME_GRACE_MS,
  MINIGAME_INTRO_S,
  clampMinigameValue,
  minigameDue,
  minigamePoints,
  pickMinigame,
  WHEEL,
  spinWheel,
  wheelPoints,
  type MinigameKind,
} from "@/lib/live-game/minigames";
import { PVP_INTRO_S, PVP_SECONDS, pvpStandings, teamArenaStandings } from "@/lib/live-game/pvp";
import { liveSnapshot } from "@/lib/live-game/live-cache";
import { INTRO_MS, borderRivals, bridgeLength, emptyCells, isAdventure, isTactic, makeCracks, raceFinish, revealAdventure, type AdvPlayer } from "@/lib/live-game/adventures";

/** "Kiber arena" rejimi: har 3 savoldan keyin qisqa jang, oxirida final */
const ARENA_EVERY = 3;
const ROUND_SECONDS = 45;

function introLeft(game: Pick<ILiveGame, "status" | "introAt">): number {
  if (game.status !== "lobby" || !game.introAt) return 0;
  return Math.max(0, new Date(game.introAt).getTime() + INTRO_MS - Date.now());
}

function goalOf(mode: LiveGameMode, total: number): number {
  return mode === "race" ? raceFinish(total) : mode === "bridge" ? bridgeLength(total) : 0;
}

/** Qo'shilish tartibi (hudud rangi, baza joyi) */
function slotsOf(players: { _id: unknown; createdAt?: Date | string }[]): string[] {
  return [...players].sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime() || String(a._id).localeCompare(String(b._id))).map((p) => String(p._id));
}

/** Shu savoldan keyin jang bormi (oxirgisidan keyin — final) */
function arenaRoundDue(mode: LiveGameMode, index: number, total: number, done: number[]): boolean {
  if (mode !== "arena" || index < 0 || index >= total - 1 || done.includes(index)) return false;
  return (index + 1) % ARENA_EVERY === 0;
}
import { arenaSocketUrl, finishPvp, loadPvpGame, pvpTick, setupPvp, watchPvp, type PvpTickInput, type PvpTickResult, type PvpWorld } from "@/lib/live-game/pvp-server";

// Jonli o'yin: mentor proyektorda boshqaradi, o'quvchilar telefondan qo'shiladi. Holat qisqa so'rovlar bilan olinadi.

type Result<T> = { success: true; data: T } | { success: false; error: string };
const fail = (error: string): { success: false; error: string } => ({ success: false, error });
const MODES: LiveGameMode[] = LIVE_GAME_MODES;
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
  /** Hozir yoki eng yaqin darsi bor guruh — oynada sukut bo'yicha tanlanadi */
  suggested: boolean;
}

/** Yaratish oynasi uchun: guruhlar va har birida nechta yaroqli savol bor */
export async function getLiveGameSetupAction(): Promise<Result<{ groups: LiveGroupOption[] }>> {
  try {
    await requireMentor();
    await connectDB();
    const groups = await Group.find({ isActive: { $ne: false } }).select("name schedule").sort({ name: 1 }).lean();
    const scheduled = groups.filter((g) => isValidSchedule(g.schedule));
    const suggestedId = scheduled.length > 0 ? pickNearestLessonGroup(scheduled)?._id.toString() : undefined;
    const active = await LiveGame.find({ ...activeFilter(), groupId: { $in: groups.map((g) => g._id) } }).select("groupId").lean();
    const activeOf = new Map(active.map((g) => [g.groupId.toString(), g._id.toString()]));
    const data = await Promise.all(
      groups.map(async (g) => ({
        id: g._id.toString(),
        name: g.name,
        today: await countLiveQuestions(g._id, "today"),
        all: await countLiveQuestions(g._id, "all"),
        activeGameId: activeOf.get(g._id.toString()) ?? null,
        suggested: g._id.toString() === suggestedId,
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
  /** Savollar orasida qisqa o'yinlar (sukutda yoqilgan) */
  minigames?: boolean;
  /** Oxirida otishmali arena bosqichi */
  arena?: boolean;
  /** Jamoaviy jangda: arena jamoa bo'lib (jamoadoshlar bir-birini urmaydi) */
  teamArena?: boolean;
}): Promise<Result<{ gameId: string; existing: boolean }>> {
  try {
    const mentor = await requireMentor();
    if (!mongoose.isValidObjectId(input?.groupId) || !MODES.includes(input.mode) || !SOURCES.includes(input.source)) {
      return fail("Ma'lumotlar noto'g'ri");
    }
    const count = COUNTS.includes(Number(input.count)) ? Number(input.count) : 10;
    const teams = Math.min(4, Math.max(2, Math.round(Number(input.teams) || 2)));
    const prizes = (Array.isArray(input.prizes) ? input.prizes : DEFAULT_PRIZES)
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
      // "Kiber arena" rejimida qisqa o'yinlar o'rnini janglar egallaydi, final jang doim bor
      options:
        input.mode === "arena"
          ? { minigames: false, arena: true, teamArena: false }
          : { minigames: input.minigames !== false, arena: input.arena === true, teamArena: input.mode === "team" && input.arena === true && input.teamArena === true },
      cells: input.mode === "territory" ? emptyCells() : [],
      cracks: input.mode === "bridge" ? makeCracks(bridgeLength(questions.length)) : [],
    });
    return { success: true, data: { gameId: game._id.toString(), existing: false } };
  } catch (err) {
    return errorOf(err, "O'yinni yaratib bo'lmadi");
  }
}

/** Rejim introsi: proyektorda va telefonlarda bir vaqtda (keyin proyektor birinchi savolni o'zi boshlaydi) */
export async function startLiveIntroAction(gameId: string): Promise<Result<{ introMs: number }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await LiveGame.findOneAndUpdate({ _id: gameId, status: "lobby" }, { $set: { introAt: new Date() } }, { returnDocument: "after" }).select("status introAt").lean();
    if (!game) return fail("O'yin allaqachon boshlangan");
    return { success: true, data: { introMs: introLeft(game) } };
  } catch (err) {
    return errorOf(err, "Introni boshlab bo'lmadi");
  }
}

/** Keyingi savol (lobby yoki natijadan keyin). Oxirgi savoldan keyin chaqirilsa — o'yin yakunlanadi */
export async function startLiveQuestionAction(gameId: string): Promise<Result<{ finished: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await LiveGame.findById(gameId).select("mode status index questions options minigame minigameRounds arena arenaRounds").lean();
    if (!game || game.status === "finished") return fail("O'yin topilmadi yoki yakunlangan");
    if (game.status === "question") return { success: true, data: { finished: false } };
    // Har 3 savoldan keyin — qisqa o'yin (bir marta)
    if (game.status === "reveal" && game.options?.minigames !== false && minigameDue(game.index, game.questions.length, game.minigameRounds ?? [])) {
      await startMinigame(game._id, game.index, (game.minigame?.kind as MinigameKind | undefined) ?? null);
      return { success: true, data: { finished: false } };
    }
    // "Kiber arena" rejimi: har 3 savoldan keyin qisqa jang
    const rounds = game.arenaRounds ?? [];
    if (game.status === "reveal" && arenaRoundDue(game.mode, game.index, game.questions.length, rounds)) {
      await startArena(game._id, game.index, ROUND_SECONDS);
      return { success: true, data: { finished: false } };
    }
    // Qisqa o'yindan keyin: tugamagan bo'lsa — avval natijasi hisoblanadi
    if (game.status === "minigame" && !game.minigame?.endedAt) await endMinigame(game._id);
    // Jangdan keyin: tugamagan bo'lsa — avval bonuslar hisoblanadi
    if (game.status === "arena" && !game.arena?.endedAt) await endArena(game._id);
    const next = game.index + 1;
    if (next >= game.questions.length) {
      // Oxirgi savoldan keyin — final jang (yoqilgan bo'lsa, bir marta), keyin g'oliblar
      const finalKey = game.questions.length - 1;
      if (game.options?.arena && !rounds.includes(finalKey) && game.status !== "arena") {
        await startArena(game._id, finalKey, PVP_SECONDS, game.mode === "team" && Boolean(game.options?.teamArena));
        return { success: true, data: { finished: false } };
      }
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
    if (isAdventure(game.mode)) await applyAdventure(game);
    await saveRanks(game._id, game.mode);
    return { success: true, data: { revealed: true } };
  } catch (err) {
    return errorOf(err, "Natijani ochib bo'lmadi");
  }
}

/** Sarguzasht rejimlari: natija ochilganda hammaga birdan (tezlik tartibida) ta'sir hisoblanadi */
async function applyAdventure(game: ILiveGame) {
  if (!isAdventure(game.mode)) return;
  const players = await LiveGamePlayer.find({ gameId: game._id }).lean();
  if (players.length === 0) return;
  const q = game.questions[game.index];
  const limitMs = q.timeLimit * 1000;
  const slots = slotsOf(players);
  const input: AdvPlayer[] = players.map((p) => {
    const a = p.answers.find((x) => x.index === game.index);
    return {
      id: p._id.toString(),
      name: p.name,
      slot: slots.indexOf(p._id.toString()),
      score: p.score,
      progress: p.progress ?? 0,
      finished: Boolean(p.finished),
      streak: p.streak,
      correct: Boolean(a?.isCorrect),
      ms: a?.ms ?? limitMs,
      tactic: a?.tactic ?? null,
      target: a?.target ?? null,
    };
  });
  const { out, cells, events, known } = revealAdventure(game.mode, input, {
    total: game.questions.length,
    limitMs,
    cells: game.cells ?? [],
    rng: Math.random,
    cracks: game.cracks ?? [],
    known: game.known ?? [],
  });
  await LiveGamePlayer.bulkWrite(
    out.map((o) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(o.id) },
        update: {
          $set: {
            score: o.score,
            progress: o.progress,
            finished: o.finished,
            effect: { index: game.index, ...o.effect },
            "answers.$[a].points": o.effect.delta,
          },
        },
        arrayFilters: [{ "a.index": game.index }],
      },
    }))
  );
  if (game.mode === "territory") await LiveGame.updateOne({ _id: game._id }, { $set: { cells } });
  if (game.mode === "bridge" && known) await LiveGame.updateOne({ _id: game._id }, { $set: { known } });
  if (events.length > 0) await pushEvents(game._id, events.slice(0, 6).map((text) => ({ text, kind: "info" as const })));
}

async function startMinigame(gameId: mongoose.Types.ObjectId, round: number, previous: MinigameKind | null) {
  const kind = pickMinigame(previous);
  const startedAt = new Date(Date.now() + MINIGAME_INTRO_S * 1000);
  const endsAt = new Date(startedAt.getTime() + MINIGAMES[kind].seconds * 1000);
  await LiveGame.updateOne(
    { _id: gameId, status: "reveal", minigameRounds: { $ne: round } },
    {
      $set: {
        status: "minigame",
        minigame: { round, kind, startedAt, endsAt, endedAt: null, wheel: null },
        questionStartedAt: null,
        ...(kind === "bonus" ? { bonusIndex: round + 1 } : {}),
      },
      $push: { minigameRounds: round },
    }
  );
  // Omad g'ildiragi: har bir o'quvchi o'z g'ildiragini aylantiradi — natija (segment) shu yerda tanlanadi
  if (kind === "wheel") {
    const players = await LiveGamePlayer.find({ gameId, "minigames.round": { $ne: round } }).select("_id").lean();
    if (players.length > 0) {
      await LiveGamePlayer.bulkWrite(
        players.map((p) => ({
          updateOne: { filter: { _id: p._id, "minigames.round": { $ne: round } }, update: { $push: { minigames: { round, value: spinWheel(), points: 0 } } } },
        }))
      );
    }
  }
}

/** Qisqa o'yin natijasi: ochkolar qo'shiladi (bir marta) */
async function endMinigame(gameId: mongoose.Types.ObjectId | string): Promise<boolean> {
  const game = await LiveGame.findOneAndUpdate(
    { _id: gameId, status: "minigame", "minigame.endedAt": null },
    { $set: { "minigame.endedAt": new Date() } },
    { returnDocument: "after" }
  );
  if (!game?.minigame) return false;
  const { kind, round } = game.minigame;
  if (kind === "tap" || kind === "target") {
    const players = await LiveGamePlayer.find({ gameId: game._id, "minigames.round": round }).select("minigames").lean();
    const values = players.map((p) => ({ id: p._id.toString(), value: p.minigames.find((m) => m.round === round)?.value ?? 0 }));
    const points = minigamePoints(kind, values);
    await Promise.all(
      [...points].map(([id, pts]) =>
        LiveGamePlayer.updateOne({ _id: id, "minigames.round": round }, { $inc: { score: pts }, $set: { "minigames.$.points": pts } })
      )
    );
  } else if (kind === "wheel") {
    const players = await LiveGamePlayer.find({ gameId: game._id, "minigames.round": round }).select("minigames name").lean();
    const big: string[] = [];
    await Promise.all(
      players.map((p) => {
        const seg = WHEEL[p.minigames.find((m) => m.round === round)?.value ?? WHEEL.length - 1] ?? WHEEL[WHEEL.length - 1];
        const pts = wheelPoints(seg.effect);
        if (seg.effect === "p500") big.push(p.name);
        return LiveGamePlayer.updateOne(
          { _id: p._id, "minigames.round": round },
          { $inc: { score: pts }, $set: { "minigames.$.points": pts, ...(seg.effect === "double" ? { double: true } : {}) } }
        );
      })
    );
    if (big.length > 0) await pushEvents(game._id, big.map((n) => ({ text: `${n} g'ildirakdan +500 yutdi!`, kind: "info" as const })));
  }
  await saveRanks(game._id, game.mode);
  return true;
}

async function startArena(gameId: mongoose.Types.ObjectId, round: number, seconds: number, teams = false) {
  const startedAt = new Date(Date.now() + PVP_INTRO_S * 1000);
  const endsAt = new Date(startedAt.getTime() + seconds * 1000);
  const res = await LiveGame.updateOne(
    { _id: gameId, arenaRounds: { $ne: round }, status: { $in: ["reveal", "minigame"] } },
    {
      $set: { status: "arena", arena: { round, startedAt, endsAt, endedAt: null, pickups: [], nextPickupAt: 0, seq: 0, feed: [] }, questionStartedAt: null },
      $push: { arenaRounds: round },
    }
  );
  if (res.modifiedCount === 0) return;
  // Jon, qurol, qahramon va joy — to'g'ri javoblarga qarab
  await setupPvp(gameId, startedAt, teams);
}

/** Arena tugadi: bonus ochkolar qo'shiladi (bir marta) */
async function endArena(gameId: mongoose.Types.ObjectId | string): Promise<boolean> {
  const game = await LiveGame.findOneAndUpdate(
    { _id: gameId, status: "arena", "arena.endedAt": null },
    { $set: { "arena.endedAt": new Date() } },
    { returnDocument: "after" }
  );
  if (!game) return false;
  // Oraliq janglarda bonus yarim (final — to'liq)
  const final = (game.arena?.round ?? game.questions.length - 1) >= game.questions.length - 1;
  const { winnerTeam } = await finishPvp(game._id, final ? 1 : 0.5);
  if (winnerTeam !== null) await pushEvents(game._id, [{ text: `⚔️ ${TEAM_NAMES[winnerTeam] ?? "Jamoa"} arenada g'alaba qozondi!`, kind: "info" }]);
  await saveRanks(game._id, game.mode);
  return true;
}

export async function endArenaAction(gameId: string): Promise<Result<{ ended: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { ended: await endArena(gameId) } };
  } catch (err) {
    return errorOf(err, "Arenani yakunlab bo'lmadi");
  }
}

/** Qisqa o'yin vaqti tugadi: natija ko'rsatiladi (proyektor vaqt tugaganda o'zi chaqiradi) */
export async function endMinigameAction(gameId: string): Promise<Result<{ ended: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { ended: await endMinigame(gameId) } };
  } catch (err) {
    return errorOf(err, "Natijani hisoblab bo'lmadi");
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

/** Natija paytidagi o'rinlar: reyting animatsiyasi kim necha o'rin ko'tarilganini shundan biladi */
async function saveRanks(gameId: mongoose.Types.ObjectId, mode: LiveGameMode) {
  const players = await LiveGamePlayer.find({ gameId }).select("score eliminated eliminatedAt team createdAt rank").lean();
  const ranked = rankPlayers(
    mode,
    players.map((p) => ({ p, id: p._id.toString(), score: p.score, eliminated: p.eliminated, eliminatedAt: p.eliminatedAt, team: p.team, joinedAt: new Date(p.createdAt ?? 0).getTime() }))
  );
  if (ranked.length === 0) return;
  await LiveGamePlayer.bulkWrite(
    ranked.map(({ p }, i) => ({
      updateOne: { filter: { _id: p._id }, update: { $set: { prevRank: p.rank ?? 0, rank: i + 1 } } },
    }))
  );
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
  /** Oxirgi natijadagi o'rni va undan oldingisi (0 — yo'q) */
  rank: number;
  prevRank: number;
  streak: number;
  lives: number;
  eliminated: boolean;
  team: number;
  answered: boolean;
  /** Natija paytida: shu savolda olingan ochko */
  lastPoints: number;
  lastCorrect: boolean | null;
  coins: number;
  progress: number;
  finished: boolean;
  /** Oxirgi natija ta'siri (faqat shu savolniki) */
  effect: { kind: string; text: string; delta: number; items: string[] } | null;
  /** Sarguzasht rejimlari: shu savolda tanlangan taktika */
  tactic: string | null;
}

export interface LiveQuestionView {
  prompt: string;
  type: LiveQuestionType;
  options: string[];
  timeLimit: number;
}

export interface LiveMinigameView {
  kind: MinigameKind;
  round: number;
  /** Boshlanishigacha (ms); 0 — boshlandi */
  startsInMs: number;
  /** Tugashigacha (ms) */
  remainingMs: number;
  ended: boolean;
  /** Tezkor bosish va mo'ljal: kim nechta (kamayish tartibida) */
  progress: { id: string; name: string; value: number; points: number; played: boolean }[];
}

function minigameView(game: Pick<ILiveGame, "minigame" | "status">, players: ILiveGamePlayer[]): LiveMinigameView | null {
  const m = game.minigame;
  if (game.status !== "minigame" || !m) return null;
  const now = Date.now();
  return {
    kind: m.kind,
    round: m.round,
    startsInMs: Math.max(0, new Date(m.startedAt).getTime() - now),
    remainingMs: Math.max(0, new Date(m.endsAt).getTime() - now),
    ended: Boolean(m.endedAt),
    progress: players
      .map((p) => {
        const r = p.minigames?.find((x) => x.round === m.round);
        return { id: p._id.toString(), name: p.name, value: r?.value ?? 0, points: r?.points ?? 0, played: Boolean(r) };
      })
      .sort((a, b) => b.value - a.value),
  };
}

export interface LiveArenaRow {
  id: string;
  name: string;
  skin: string;
  kills: number;
  lives: number;
  maxLives: number;
  out: boolean;
  killedBy: string | null;
  points: number;
  place: number;
  /** Jamoaviy arenada jamoa; -1 — individual */
  team: number;
}

export interface LiveArenaView {
  /** Real vaqt xonasi manzili (tomoshabin bileti bilan); null — HTTP so'rovlar */
  ws?: string | null;
  /** Qaysi savoldan keyingi jang; final — oxirgi savol */
  round: number;
  final: boolean;
  startsInMs: number;
  remainingMs: number;
  ended: boolean;
  rows: LiveArenaRow[];
  alive: number;
  /** Jamoaviy arena: jamoalar holati (tirik a'zolar bo'yicha tartiblangan); individualda — null */
  teams: { team: number; name: string; alive: number; members: number; kills: number }[] | null;
}

function arenaView(game: Pick<ILiveGame, "arena" | "status" | "questions">, players: ILiveGamePlayer[]): LiveArenaView | null {
  const a = game.arena;
  if (game.status !== "arena" || !a) return null;
  const now = Date.now();
  const rows = pvpStandings(
    players
      .filter((p) => p.arena && typeof p.arena.lives === "number")
      .map((p) => ({
        id: p._id.toString(),
        name: p.name,
        skin: p.arena!.skin,
        kills: p.arena!.kills,
        lives: p.arena!.lives,
        maxLives: p.arena!.maxLives,
        out: p.arena!.out,
        outAt: p.arena!.outAt ?? 0,
        killedBy: p.arena!.killedBy ?? null,
        points: p.arena!.points,
        place: p.arena!.place,
        team: p.arena!.team ?? -1,
      }))
  ).map(({ outAt: _o, ...r }) => r);
  const teamed = rows.some((r) => r.team >= 0);
  const round = a.round ?? game.questions.length - 1;
  return {
    round,
    final: round >= game.questions.length - 1,
    startsInMs: Math.max(0, new Date(a.startedAt).getTime() - now),
    remainingMs: Math.max(0, new Date(a.endsAt).getTime() - now),
    ended: Boolean(a.endedAt),
    rows,
    alive: rows.filter((r) => !r.out).length,
    teams: teamed ? teamArenaStandings(rows).map((t) => ({ team: t.team, name: TEAM_NAMES[t.team] ?? `${t.team + 1}-jamoa`, alive: t.alive, members: t.members, kills: t.kills })) : null,
  };
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
  minigame: LiveMinigameView | null;
  /** Joriy savol — bonus raund (×2) */
  bonus: boolean;
  arena: LiveArenaView | null;
  /** Oxirgi savoldan keyin arena bo'ladimi (hali o'tkazilmagan) */
  arenaNext: boolean;
  /** "Kiber arena": shu natijadan keyin jang bo'ladimi */
  arenaRoundNext: boolean;
  /** Rejim introsi qolgan vaqti (ms) */
  introMs: number;
  /** Sarguzasht rejimlari: marra (m) yoki ko'prik uzunligi */
  goal: number;
  /** "Hudud bosib olish": katak egalari (o'yinchining qo'shilish tartibi) */
  cells: number[];
  /** Qo'shilish tartibi bo'yicha o'yinchi id'lari (hudud ranglari uchun) */
  slots: string[];
  /** "Ko'prikdan o'tish": har qadamda ochilgan taxtalar — singanmi */
  planks: { known: number; broken: number }[];
  /** Kutish zalida: guruhdagi hali qo'shilmagan o'quvchilar (ismlari) */
  waiting: string[];
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
      rank: p.rank ?? 0,
      prevRank: p.prevRank ?? 0,
      streak: p.streak,
      lives: p.lives,
      eliminated: p.eliminated,
      team: p.team,
      answered: Boolean(ans),
      lastPoints: ans?.points ?? 0,
      lastCorrect: ans ? ans.isCorrect : null,
      coins: p.coins ?? 0,
      progress: p.progress ?? 0,
      finished: Boolean(p.finished),
      effect: p.effect && p.effect.index === index ? { kind: p.effect.kind, text: p.effect.text, delta: p.effect.delta, items: p.effect.items ?? [] } : null,
      tactic: ans?.tactic ?? null,
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
      LiveGamePlayer.find({ gameId: game._id }).lean<(ILiveGamePlayer & { _id: mongoose.Types.ObjectId })[]>(),
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
        minigame: minigameView(game, players),
        bonus: game.bonusIndex === game.index && game.index >= 0,
        arena: await (async () => {
          const v = arenaView(game, players);
          return v ? { ...v, ws: v.ended ? null : await arenaSocketUrl(game, null) } : null;
        })(),
        arenaNext: Boolean(game.options?.arena && !(game.arenaRounds ?? []).includes(game.questions.length - 1)),
        introMs: introLeft(game),
        arenaRoundNext: game.status === "reveal" && arenaRoundDue(game.mode, game.index, game.questions.length, game.arenaRounds ?? []),
        goal: goalOf(game.mode, game.questions.length),
        cells: game.mode === "territory" ? game.cells ?? [] : [],
        slots: slotsOf(players),
        planks: bridgePlanks(game),
        waiting:
          game.status === "lobby"
            ? (await groupRoster(game.groupId.toString())).filter((s) => !players.some((p) => p.studentId.toString() === s.id)).map((s) => s.name)
            : [],
      },
    };
  } catch (err) {
    return errorOf(err, "Holatni olib bo'lmadi");
  }
}

// Guruh ro'yxati (kutish zali uchun): proyektor har soniyada so'raydi — qisqa muddat saqlanadi
const rosterCache = new Map<string, { at: number; list: { id: string; name: string }[] }>();
async function groupRoster(groupId: string): Promise<{ id: string; name: string }[]> {
  const c = rosterCache.get(groupId);
  if (c && Date.now() - c.at < 15_000) return c.list;
  const list = (await User.find({ groupId, role: "student" }).select("fullName").sort({ fullName: 1 }).lean()).map((u) => ({ id: u._id.toString(), name: u.fullName }));
  if (rosterCache.size > 100) rosterCache.clear();
  rosterCache.set(groupId, { at: Date.now(), list });
  return list;
}

/** Ko'prik: faqat bosilgan (ochilgan) taxtalar va ulardan qaysi biri singan — yashirin yoriqlar ko'rsatilmaydi */
function bridgePlanks(game: Pick<ILiveGame, "mode" | "questions" | "cracks" | "known">): { known: number; broken: number }[] {
  if (game.mode !== "bridge") return [];
  return Array.from({ length: bridgeLength(game.questions.length) }, (_, i) => {
    const known = game.known?.[i] ?? 0;
    const crack = game.cracks?.[i] ?? -1;
    return { known, broken: crack >= 0 && known & (1 << crack) ? 1 << crack : 0 };
  });
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
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId) || !Number.isInteger(index) || index < 0) {
      return fail("Bu savolga hozir javob berib bo'lmaydi");
    }
    await connectDB();
    // 100 o'quvchi bir vaqtda javob beradi: butun o'yin emas, faqat tekshiruv uchun kerakli maydonlar va shu savol
    const [game, player] = await Promise.all([
      LiveGame.findById(gameId)
        .select({ groupId: 1, status: 1, index: 1, questionStartedAt: 1, mode: 1, bonusIndex: 1, questions: { $slice: [index, 1] } })
        .lean<Pick<ILiveGame, "groupId" | "status" | "index" | "questionStartedAt" | "mode" | "bonusIndex" | "questions"> & { _id: mongoose.Types.ObjectId }>(),
      LiveGamePlayer.findOne({ gameId, studentId: user.userId }).select("-minigames -arena").lean<ILiveGamePlayer & { _id: mongoose.Types.ObjectId }>(),
    ]);
    if (!game || game.groupId.toString() !== String(user.groupId ?? "")) return fail("Bu savolga hozir javob berib bo'lmaydi");
    if (game.status !== "question" || game.index !== index || !game.questionStartedAt || !game.questions[0]) return fail("Bu savolga hozir javob berib bo'lmaydi");
    const q = game.questions[0];
    const elapsed = Date.now() - new Date(game.questionStartedAt).getTime();
    if (elapsed > q.timeLimit * 1000 + LIVE_GRACE_MS) return fail("Vaqt tugadi");

    if (!player) return fail("Avval o'yinga qo'shiling");
    if (player.eliminated) return fail("Siz o'yindan chiqqansiz");
    if (player.answers.some((a) => a.index === index)) return fail("Bu savolga javob berdingiz");

    const clean = cleanValue(value);
    const graded = autoGradeQuiz({
      questions: [{ _id: "q", type: q.type, prompt: q.prompt, options: q.options, correctAnswers: q.correctAnswers, points: 1 }],
      submittedAnswers: [{ questionId: "q", value: clean }],
    });
    const isCorrect = Boolean(graded.answers[0]?.isCorrect);
    const o = scoreAnswer(game.mode, player, { isCorrect, elapsedMs: elapsed, limitSec: q.timeLimit, bonus: game.bonusIndex === index });

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

/** Sarguzasht rejimlari: javobdan keyin taktika tanlash (natija ochilguncha o'zgartirish mumkin) */
export async function chooseLiveTacticAction(gameId: string, index: number, tactic: string, target?: string | null): Promise<Result<{ tactic: string }>> {
  try {
    const user = await requireStudent();
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId) || !Number.isInteger(index) || index < 0 || typeof tactic !== "string") {
      return fail("Taktikani tanlab bo'lmaydi");
    }
    await connectDB();
    const game = await LiveGame.findById(gameId)
      .select({ groupId: 1, status: 1, index: 1, mode: 1, questionStartedAt: 1, questions: { $slice: [index, 1] } })
      .lean<Pick<ILiveGame, "groupId" | "status" | "index" | "mode" | "questionStartedAt" | "questions"> & { _id: mongoose.Types.ObjectId }>();
    if (!game || game.groupId.toString() !== String(user.groupId ?? "")) return fail("O'yin topilmadi");
    if (!isAdventure(game.mode) || !isTactic(game.mode, tactic)) return fail("Bu taktika yo'q");
    if (game.status !== "question" || game.index !== index || !game.questionStartedAt) return fail("Savol yopildi");
    const limit = (game.questions[0]?.timeLimit ?? 20) * 1000;
    if (Date.now() - new Date(game.questionStartedAt).getTime() > limit + LIVE_GRACE_MS) return fail("Vaqt tugadi");
    const clean = typeof target === "string" ? target.slice(0, 40) : null;
    const res = await LiveGamePlayer.updateOne(
      { gameId: game._id, studentId: user.userId, answers: { $elemMatch: { index } } },
      { $set: { "answers.$.tactic": tactic, "answers.$.target": clean } }
    );
    if (res.matchedCount === 0) return fail("Avval savolga javob bering");
    return { success: true, data: { tactic } };
  } catch (err) {
    return errorOf(err, "Taktikani saqlab bo'lmadi");
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
    /** Oxirgi natijadagi o'rni va undan oldingisi (animatsiya uchun) */
    lastRank: number;
    prevRank: number;
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
    /** Sarguzasht rejimlari: masofa / balandlik / qadam / olmos / katak */
    progress: number;
    finished: boolean;
    /** Natija paytida: shu savolning ta'siri */
    effect: { kind: string; text: string; delta: number; items: string[] } | null;
    /** Qo'shilish tartibi (hudud rangi) */
    slot: number;
  } | null;
  /** Sarguzasht rejimlari: javobdan keyingi taktika tanlovi uchun */
  tactics: {
    /** Tanlangan taktika (shu savolda) */
    picked: string | null;
    target: string | null;
    /** Poyga: oldingi robotlar (yaqinlari) */
    ahead: { id: string; name: string; progress: number }[];
    /** Hudud: chegaradosh raqiblar */
    rivals: { slot: number; name: string; cells: number }[];
    /** Ko'prik: keyingi qadamdagi taxtalar (ochilgan / singan bit maskasi) */
    plank: { known: number; broken: number } | null;
  } | null;
  /** Marra yoki ko'prik uzunligi */
  goal: number;
  /** "Hudud bosib olish" xaritasi (natija paytida) */
  cells: number[];
  /** Kutish zalida rejim introsi qolgan vaqti (ms); 0 — yo'q */
  introMs: number;
  standings: ReturnType<typeof teamStandings>;
  top: { name: string; score: number; coins: number }[];
  minigame: (Omit<LiveMinigameView, "progress"> & { myValue: number; myPoints: number; place: number }) | null;
  bonus: boolean;
  arena: {
    /** Real vaqt xonasi manzili (o'yinchi bileti bilan); null — HTTP so'rovlar */
    ws: string | null;
    playerId: string;
    cooldown: number;
    round: number;
    final: boolean;
    startsInMs: number;
    remainingMs: number;
    ended: boolean;
    alive: number;
    total: number;
    lives: number;
    maxLives: number;
    weapon: string;
    skin: string;
    kills: number;
    out: boolean;
    killedBy: string | null;
    points: number;
    place: number;
    /** Jamoaviy arenada o'z jamoasi (-1 — individual) va jamoalar holati */
    team: number;
    teams: LiveArenaView["teams"];
  } | null;
}

export async function getLivePlayerStateAction(gameId: string): Promise<Result<LivePlayerState>> {
  try {
    const user = await requireStudent();
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    // Umumiy holat — qisqa keshdan (hamma o'quvchi uchun bitta yuklash, ≤400 ms eski). Yuborilgan javobni
    // ekran o'zi eslab qoladi; o'z yozuvi faqat keshda hali bo'lmasa (hozirgina qo'shilgan) alohida o'qiladi
    const snap = await liveSnapshot(gameId);
    if (!snap || snap.game.groupId.toString() !== String(user.groupId ?? "")) return fail("O'yin topilmadi");
    const game = snap.game;
    const group = { name: snap.groupName };
    const players: ILiveGamePlayer[] = [...snap.players];
    let mine = players.find((p) => p.studentId.toString() === user.userId);
    if (!mine) {
      const fresh = await LiveGamePlayer.findOne({ gameId, studentId: user.userId }).lean<ILiveGamePlayer & { _id: mongoose.Types.ObjectId }>();
      if (fresh) {
        players.push(fresh);
        mine = fresh;
      }
    }
    const q = game.index >= 0 ? game.questions[game.index] : null;
    const revealed = game.status === "reveal" || game.status === "finished";
    const ans = mine?.answers.find((a) => a.index === game.index);
    // Savol davomida javob natijasi yashirin: ochko, o'rin, seriya, jon va sandiq javobgacha bo'lgan holatda ko'rsatiladi
    // (server ochkoni javob kelganda yozadi — aks holda to'g'ri/xato natija ochilishidan oldin bilinib qolardi)
    const hide = game.status === "question";
    const current = (p: ILiveGamePlayer) => (hide ? p.answers.find((a) => a.index === game.index) : undefined);
    const shownScore = (p: ILiveGamePlayer) => p.score - (current(p)?.points ?? 0);
    const rows = hide
      ? rankPlayers(
          game.mode,
          players.map((p) => ({
            id: p._id.toString(),
            score: shownScore(p),
            eliminated: p.eliminated && p.eliminatedAt !== game.index,
            eliminatedAt: p.eliminatedAt,
            team: p.team,
            joinedAt: new Date(p.createdAt ?? 0).getTime(),
            name: p.name,
            coins: p.coins ?? 0,
          }))
        )
      : toRows(players, game.mode, game.index);
    const hiddenAns = mine ? current(mine) : undefined;
    const streakBefore = (p: ILiveGamePlayer) => {
      let n = 0;
      for (const a of [...p.answers].filter((x) => x.index < game.index).sort((x, y) => y.index - x.index)) {
        if (!a.isCorrect) break;
        n++;
      }
      return n;
    };
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
              score: shownScore(mine),
              rank: rows.findIndex((r) => r.id === mine._id.toString()) + 1,
              lastRank: mine.rank ?? 0,
              prevRank: mine.prevRank ?? 0,
              players: rows.length,
              lives: hiddenAns && game.mode === "survival" && !hiddenAns.isCorrect ? mine.lives + 1 : mine.lives,
              eliminated: mine.eliminated && !(hiddenAns && mine.eliminatedAt === game.index),
              team: mine.team,
              teamName: TEAM_NAMES[mine.team] ?? "",
              chests: hiddenAns?.isCorrect && game.mode === "chest" ? Math.max(0, mine.chests - 1) : mine.chests,
              shield: mine.shield,
              double: mine.double,
              streak: hiddenAns ? streakBefore(mine) : mine.streak,
              coins: mine.coins ?? 0,
              answered: Boolean(ans),
              value: ans ? ans.value : null,
              lastCorrect: revealed && ans ? ans.isCorrect : null,
              lastPoints: revealed && ans ? ans.points : 0,
              progress: mine.progress ?? 0,
              finished: Boolean(mine.finished),
              effect: revealed && mine.effect && mine.effect.index === game.index ? { kind: mine.effect.kind, text: mine.effect.text, delta: mine.effect.delta, items: mine.effect.items ?? [] } : null,
              slot: slotsOf(players).indexOf(mine._id.toString()),
            }
          : null,
        tactics: (() => {
          if (!isAdventure(game.mode) || game.status !== "question" || !mine) return null;
          const slots = slotsOf(players);
          const mySlot = slots.indexOf(mine._id.toString());
          const nameOf = (slot: number) => players.find((p) => p._id.toString() === slots[slot])?.name ?? "?";
          const cells = game.cells ?? [];
          return {
            picked: ans?.tactic ?? null,
            target: ans?.target ?? null,
            ahead:
              game.mode === "race"
                ? players
                    .filter((p) => !p.finished && (p.progress ?? 0) > (mine.progress ?? 0))
                    .sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0))
                    .slice(0, 4)
                    .map((p) => ({ id: p._id.toString(), name: p.name, progress: p.progress ?? 0 }))
                : [],
            rivals:
              game.mode === "territory"
                ? borderRivals(cells, mySlot)
                    .map((slot) => ({ slot, name: nameOf(slot), cells: cells.filter((c) => c === slot).length }))
                    .sort((a, b) => b.cells - a.cells)
                    .slice(0, 6)
                : [],
            plank: game.mode === "bridge" && !mine.finished ? bridgePlanks(game)[mine.progress ?? 0] ?? null : null,
          };
        })(),
        goal: goalOf(game.mode, game.questions.length),
        cells: game.mode === "territory" && game.status !== "question" ? game.cells ?? [] : [],
        introMs: introLeft(game),
        standings: game.mode === "team" ? teamStandings(players, game.teams) : [],
        top: game.status === "finished" ? rows.slice(0, 5).map((r) => ({ name: r.name, score: r.score, coins: r.coins })) : [],
        minigame: (() => {
          const view = minigameView(game, players);
          if (!view) return null;
          const { progress, ...rest } = view;
          const myIndex = progress.findIndex((p) => p.id === mine?._id.toString());
          const my = myIndex >= 0 ? progress[myIndex] : null;
          return {
            ...rest,
            myValue: my?.played ? my.value : -1,
            myPoints: my?.points ?? 0,
            place: my && my.value > 0 ? myIndex + 1 : 0,
          };
        })(),
        bonus: game.bonusIndex === game.index && game.index >= 0,
        arena: await (async () => {
          const v = arenaView(game, players);
          const a = mine?.arena;
          if (!v) return null;
          return {
            ws: mine && !v.ended ? await arenaSocketUrl(game, mine) : null,
            playerId: mine?._id.toString() ?? "",
            cooldown: a?.cooldown ?? 0.36,
            round: v.round,
            final: v.final,
            startsInMs: v.startsInMs,
            remainingMs: v.remainingMs,
            ended: v.ended,
            alive: v.alive,
            total: v.rows.length,
            lives: a?.lives ?? 0,
            maxLives: a?.maxLives ?? 3,
            weapon: a?.weapon ?? "Lazer-1",
            skin: a?.skin ?? "bolt",
            kills: a?.kills ?? 0,
            out: a?.out ?? true,
            killedBy: a?.killedBy ?? null,
            points: a?.points ?? 0,
            place: a?.place ?? 0,
            team: a?.team ?? -1,
            teams: v.teams,
          };
        })(),
      },
    };
  } catch (err) {
    return errorOf(err, "Holatni olib bo'lmadi");
  }
}

/** Qisqa o'yin natijasi (o'yin davomida bir necha marta yuboriladi — eng kattasi olinadi) */
export async function submitMinigameAction(gameId: string, round: number, value: number): Promise<Result<{ value: number }>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    const m = game?.minigame;
    if (!game || game.status !== "minigame" || !m || m.round !== round || m.endedAt) return fail("O'yin tugagan");
    if (m.kind !== "tap" && m.kind !== "target") return fail("Bu o'yinda natija yuborilmaydi");
    const now = Date.now();
    if (now < new Date(m.startedAt).getTime() - 500 || now > new Date(m.endsAt).getTime() + MINIGAME_GRACE_MS) return fail("Vaqt tugadi");
    const v = clampMinigameValue(m.kind, value);
    const player = await LiveGamePlayer.findOne({ gameId: game._id, studentId: user.userId }).select("_id").lean();
    if (!player) return fail("Avval o'yinga qo'shiling");
    const res = await LiveGamePlayer.updateOne({ _id: player._id, "minigames.round": round }, { $max: { "minigames.$.value": v } });
    if (res.matchedCount === 0) {
      await LiveGamePlayer.updateOne({ _id: player._id, "minigames.round": { $ne: round } }, { $push: { minigames: { round, value: v, points: 0 } } });
    }
    return { success: true, data: { value: v } };
  } catch (err) {
    return errorOf(err, "Natijani yuborib bo'lmadi");
  }
}

/**
 * "Kiber jang" qadami: o'quvchi ~5 marta/soniyada joylashuvi, otgan o'qlari va tekkizganlarini yuboradi.
 * Javobda — butun maydon (boshqalar, o'qlar, sovg'alar, kim kimni yiqitdi) va o'z holati (jon, kuchlar).
 */
export async function pvpTickAction(gameId: string, input: PvpTickInput): Promise<Result<PvpTickResult>> {
  try {
    const user = await requireStudent();
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await loadPvpGame(gameId);
    if (!game || game.groupId.toString() !== String(user.groupId ?? "")) return fail("O'yin topilmadi");
    if (game.status !== "arena" || !game.arena) return fail("Arena tugagan");
    const res = await pvpTick(game, user.userId, input);
    if (!res) return fail("Avval o'yinga qo'shiling");
    return { success: true, data: res };
  } catch (err) {
    return errorOf(err, "Arenaga ulanib bo'lmadi");
  }
}

/** Proyektor: butun maydon jonli (tez so'rovlar bilan) */
export async function watchArenaAction(gameId: string): Promise<Result<PvpWorld | null>> {
  try {
    await requireMentor();
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: await watchPvp(gameId) };
  } catch (err) {
    return errorOf(err, "Arenani olib bo'lmadi");
  }
}
