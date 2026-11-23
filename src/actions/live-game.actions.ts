"use server";

import { MIN_HUMAN_ANSWER_MS } from "@/lib/anti-cheat/kinds";
import { recordCheats } from "@/lib/anti-cheat/record";
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
import { dateFromKey, isLessonNow, isValidSchedule, pickNearestLessonGroup, toDateKey } from "@/lib/schedule";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppSettings } from "@/lib/settings";
import {
  AUTO_MINIGAME_S,
  AUTO_REVEAL_CHEST_S,
  AUTO_REVEAL_S,
  studentGameReady,
  STUDENT_GAME_COUNTS,
  STUDENT_LOBBY_MAX_MS,
  isFreeNow,
  studentGameCost,
  studentGamePrizes,
  type StudentGameAudience,
} from "@/lib/live-game/student-games-config";
import { absenceBanMessage, absenceBanUntil, gradeOfGroup, refundStudentGame } from "@/lib/live-game/student-games";
import { notifyGroup, notifyMany, notifyMentors } from "@/lib/notifications/notify";
import {
  LIVE_MODES,
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
  isScoredMinigame,
  minigameBetter,
  minigameDue,
  minigamePoints,
  openBox,
  BOX_GIFT_CHANCE,
  GIFT_FALLBACK_COINS,
  pickRound,
  prizeOf,
  spinSuperWheel,
  SUPER_WHEEL,
  WHEEL,
  spinWheel,
  wheelPoints,
  type LivePrizeKind,
  type MinigameKind,
} from "@/lib/live-game/minigames";
import { awardCoins } from "@/lib/gamification/award";
import { MAX_POWER, cleanLook, gameLook, pickGiftItem, type GameLook } from "@/lib/character/catalog";
import { giftView, grantCharacterGift, type GiftView } from "@/lib/character/grant";
import { EMOTE_GAP_MS, EMOTE_MS, emoteOf, hasEmote } from "@/lib/character/emotes";
import { BOOSTER_MAX_PER_GAME, boosterOf, boosterWorks } from "@/lib/live-game/boosters";
import { PUSH_GAP_MS, PUSH_MS, lobbyNeighbors, type PushDir } from "@/lib/live-game/push";
import { ZONE_EVERY, ZONE_INTRO_S, ROBOT_COLORS, zoneDurationMs, zonePoints, zoneSpawn, zoneSpeed, zoneWaveCount } from "@/lib/live-game/zone";
import { resolveZoneWaves, zoneRealtimeEnabled, zoneSocketUrl } from "@/lib/live-game/zone-server";
import {
  GALAXY_EVERY,
  GALAXY_FINAL_SECONDS,
  GALAXY_INTRO_S,
  GALAXY_SECONDS,
  SHIP_COLORS,
  galaxyPoints,
  galaxyStandings,
  galaxyTurbo,
  seedOf,
} from "@/lib/live-game/galaxy";
import { MAP_IDS, MAP_VOTE_S, PVP_INTRO_S, PVP_SECONDS, isMapId, mapOf, pickMap, pvpStandings, teamArenaStandings, type MapId } from "@/lib/live-game/pvp";
import { invalidateLiveSnapshot, liveSnapshot } from "@/lib/live-game/live-cache";
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
/** "Yashil zona": har 3 savoldan keyin raund (oxirgi savoldan keyin — final, alohida) */
function zoneRoundDue(mode: LiveGameMode, index: number, total: number, done: number[]): boolean {
  if (mode !== "zone" || index < 0 || index >= total - 1 || done.includes(index)) return false;
  return (index + 1) % ZONE_EVERY === 0;
}

/** "Galaktika poygasi 3D": har 3 savoldan keyin poyga (oxirgi savoldan keyin — final, alohida) */
function galaxyRoundDue(mode: LiveGameMode, index: number, total: number, done: number[]): boolean {
  if (mode !== "galaxy" || index < 0 || index >= total - 1 || done.includes(index)) return false;
  return (index + 1) % GALAXY_EVERY === 0;
}

function arenaRoundDue(mode: LiveGameMode, index: number, total: number, done: number[]): boolean {
  if (mode !== "arena" || index < 0 || index >= total - 1 || done.includes(index)) return false;
  return (index + 1) % ARENA_EVERY === 0;
}
import { arenaSocketUrl, finishPvp, loadPvpGame, pvpTick, setupPvp, watchPvp, type PvpTickInput, type PvpTickResult, type PvpWorld } from "@/lib/live-game/pvp-server";
import { mayPlay } from "@/lib/live-game/student-games";
import { isFresh } from "@/lib/utils";

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

// Guruhning faol o'yini: har bir o'quvchi tabi 20 s da bir so'raydi — guruh bo'yicha 3 s keshlanadi
// (200 ta ochiq tab bazaga sekundiga 10 ta emas, guruhga 3 s da bitta so'rov). O'yin ochilganda/yakunlanganda tozalanadi.
type ActiveGame = { _id: mongoose.Types.ObjectId; mode: LiveGameMode; status: LiveGameStatus } | null;
const ACTIVE_TTL_MS = process.env.VITEST ? 0 : 3000;
const activeByGroup = new Map<string, { at: number; p: Promise<ActiveGame> }>();
function activeGameOfGroup(groupId: string, grade: number | null = null): Promise<ActiveGame> {
  const now = Date.now();
  const c = activeByGroup.get(groupId);
  if (c && isFresh(c.at, ACTIVE_TTL_MS, now)) return c.p;
  // Guruh o'yini yoki butun sinf uchun ochilgan o'quvchi o'yini; mentor o'yini birinchi
  const p = LiveGame.findOne({ ...activeFilter(), $or: [{ groupId }, ...(grade !== null ? [{ studentGame: true, grade }] : [])] })
    .select("mode status")
    .sort({ studentGame: 1, createdAt: -1 })
    .lean<ActiveGame>()
    .exec();
  if (activeByGroup.size > 2000) activeByGroup.clear();
  activeByGroup.set(groupId, { at: now, p });
  p.catch(() => activeByGroup.delete(groupId));
  return p;
}

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
    const active = await LiveGame.find({ ...activeFilter(), groupId: { $in: groups.map((g) => g._id) }, studentGame: { $ne: true } }).select("groupId").lean();
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
  /** Qisqa o'yinlar orasida "Yashil zona" ham chiqsin */
  zoneMini?: boolean;
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

    const existing = await LiveGame.findOne({ ...activeFilter(), groupId: group._id, studentGame: { $ne: true } }).select("_id").lean();
    if (existing) return { success: true, data: { gameId: existing._id.toString(), existing: true } };
    // Mentor o'yini ustun: shu guruhdagi o'quvchi o'yinlari to'xtatiladi (boshlanmagan bo'lsa — coin qaytariladi)
    const grade = await gradeOfGroup(group._id.toString());
    const studentGames = await LiveGame.find({ ...activeFilter(), studentGame: true, $or: [{ groupId: group._id }, ...(grade !== null ? [{ grade }] : [])] })
      .select("status introAt")
      .lean();
    for (const sg of studentGames) await cancelStudentGame(sg._id, "mentor jonli o'yin boshladi", sg.status === "lobby" && !sg.introAt);

    const questions = await pickQuestions(group._id, input.source, count);
    if (questions.length === 0) {
      return fail(input.source === "today" ? "Bugungi darsda test savollari yo'q" : "Guruh darslarida test savollari yo'q");
    }
    activeByGroup.clear();
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
          : input.mode === "galaxy" || input.mode === "zone"
          ? { minigames: false, arena: false, teamArena: false }
          : {
              minigames: input.minigames !== false,
              arena: input.arena === true,
              teamArena: input.mode === "team" && input.arena === true && input.teamArena === true,
              zone: input.minigames !== false && input.zoneMini === true,
            },
      cells: input.mode === "territory" ? emptyCells() : [],
      cracks: input.mode === "bridge" ? makeCracks(bridgeLength(questions.length)) : [],
    });
    // Guruh o'quvchilariga Telegram: "Qatnashish" tugmasi bilan (faqat yangi o'yinda — mavjudi qaytarilganda emas)
    notifyGroup(group._id, "live_game", {
      gameId: game._id.toString(),
      modeTitle: LIVE_MODES[input.mode].title,
      tagline: LIVE_MODES[input.mode].tagline,
      topPrize: prizes[0] || undefined,
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
    // O'quvchi o'yini: coin yig'ilgan va kamida N o'yinchi bo'lishi shart
    const sg = await LiveGame.findById(gameId).select("studentGame").lean();
    if (sg?.studentGame) {
      const r = await startStudentGame(gameId, null);
      if (!r.success) return r;
      const after = await LiveGame.findById(gameId).select("status introAt").lean();
      return { success: true, data: { introMs: after ? introLeft(after) : 0 } };
    }
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
    return await advanceGame(gameId);
  } catch (err) {
    return errorOf(err, "Savolni boshlab bo'lmadi");
  }
}

/**
 * Keyingi bosqich (mentor tugmasi yoki o'quvchi o'yinida server o'zi). Barcha yozuvlar shartli —
 * ikki tomon bir vaqtda chaqirsa ham savol o'tkazib yuborilmaydi.
 */
async function advanceGame(gameId: string | mongoose.Types.ObjectId): Promise<Result<{ finished: boolean }>> {
  {
    const game = await LiveGame.findById(gameId).select("mode status index questions options minigame minigameRounds minigameKinds arena arenaRounds galaxy galaxyRounds zone zoneRounds").lean();
    if (!game || game.status === "finished") return fail("O'yin topilmadi yoki yakunlangan");
    if (game.status === "question") return { success: true, data: { finished: false } };
    // Har 3 savoldan keyin — qisqa o'yin (bir marta)
    if (game.status === "reveal" && game.options?.minigames !== false && minigameDue(game.index, game.questions.length, game.minigameRounds ?? [])) {
      // Tasodifiy tartib: shu o'yinda hamma tur (va yoqilgan bo'lsa "Yashil zona") bir martadan chiqmaguncha takrorlanmaydi
      const kind = pickRound(game.minigameKinds ?? [], Boolean(game.options?.zone));
      if (kind === "zone") await startZone(game._id, game.index, false, true);
      else await startMinigame(game._id, game.index, kind);
      return { success: true, data: { finished: false } };
    }
    // "Kiber arena" rejimi: har 3 savoldan keyin qisqa jang
    const rounds = game.arenaRounds ?? [];
    if (game.status === "reveal" && arenaRoundDue(game.mode, game.index, game.questions.length, rounds)) {
      await startArena(game._id, game.index, ROUND_SECONDS);
      return { success: true, data: { finished: false } };
    }
    // "Galaktika poygasi 3D": har 3 savoldan keyin poyga
    const galaxyRounds = game.galaxyRounds ?? [];
    if (game.status === "reveal" && galaxyRoundDue(game.mode, game.index, game.questions.length, galaxyRounds)) {
      await startGalaxy(game._id, game.index, false);
      return { success: true, data: { finished: false } };
    }
    // "Yashil zona": har 3 savoldan keyin raund
    const zoneRounds = game.zoneRounds ?? [];
    if (game.status === "reveal" && zoneRoundDue(game.mode, game.index, game.questions.length, zoneRounds)) {
      await startZone(game._id, game.index, false);
      return { success: true, data: { finished: false } };
    }
    if (game.status === "zone" && !game.zone?.endedAt) await endZone(game._id);
    // Qisqa o'yindan keyin: tugamagan bo'lsa — avval natijasi hisoblanadi
    if (game.status === "minigame" && !game.minigame?.endedAt) await endMinigame(game._id);
    // Poygadan keyin: tugamagan bo'lsa — avval ochkolar
    if (game.status === "galaxy" && !game.galaxy?.endedAt) await endGalaxy(game._id);
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
      if (game.mode === "zone" && !zoneRounds.includes(finalKey) && game.status !== "zone") {
        await startZone(game._id, finalKey, true);
        return { success: true, data: { finished: false } };
      }
      if (game.mode === "galaxy" && !galaxyRounds.includes(finalKey) && game.status !== "galaxy") {
        await startGalaxy(game._id, finalKey, true);
        return { success: true, data: { finished: false } };
      }
      await finishLiveGame(game._id);
      return { success: true, data: { finished: true } };
    }
    await LiveGame.updateOne(
      { _id: game._id, index: game.index, status: game.status },
      { $set: { status: "question", index: next, questionStartedAt: new Date(), revealedAt: null } }
    );
    return { success: true, data: { finished: false } };
  }
}

/** Savol yopiladi: to'g'ri javob ochiladi, javob bermaganlar xato deb hisoblanadi */
export async function revealLiveQuestionAction(gameId: string): Promise<Result<{ revealed: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { revealed: await revealGame(gameId) } };
  } catch (err) {
    return errorOf(err, "Natijani ochib bo'lmadi");
  }
}

/** Natijani ochish (mentor yoki o'quvchi o'yinida server o'zi); bir marta — shartli */
async function revealGame(gameId: string | mongoose.Types.ObjectId): Promise<boolean> {
  {
    const game = await LiveGame.findOneAndUpdate(
      { _id: gameId, status: "question" },
      { $set: { status: "reveal", questionStartedAt: null, revealedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!game) return false;

    // Javob bermaganlar — bitta so'rovda (100 o'quvchida 100 ta ketma-ket so'rov emas)
    const missing = await LiveGamePlayer.find({ gameId: game._id, eliminated: false, "answers.index": { $ne: game.index } })
      .select("name score streak lives eliminated double guard")
      .lean();
    const outIds: mongoose.Types.ObjectId[] = [];
    const ops = missing.map((p) => {
      const o = missedAnswer(game.mode, { ...p, double: Boolean(p.double), guard: Boolean(p.guard) });
      if (o.eliminated) outIds.push(p._id);
      return {
        updateOne: {
          filter: { _id: p._id, "answers.index": { $ne: game.index } },
          update: {
            $push: { answers: { index: game.index, value: "", isCorrect: false, ms: 0, points: 0 } },
            $set: { streak: o.streak, lives: o.lives, eliminated: o.eliminated, guard: o.guard, ...(o.eliminated ? { eliminatedAt: game.index } : {}) },
          },
        },
      };
    });
    if (ops.length > 0) await LiveGamePlayer.bulkWrite(ops, { ordered: false });
    // Chiqib ketganlar: shu savolda haqiqatan yozilganlari (oxirgi lahzada javob bergan bo'lsa — yozilmagan)
    const outs =
      outIds.length > 0
        ? (await LiveGamePlayer.find({ _id: { $in: outIds }, eliminated: true, eliminatedAt: game.index, answers: { $elemMatch: { index: game.index, value: "", ms: 0 } } }).select("name").lean()).map((p) => p.name)
        : [];
    if (outs.length > 0) await pushEvents(game._id, outs.map((n) => ({ text: `${n} o'yindan chiqdi`, kind: "out" as const })));
    if (isAdventure(game.mode)) await applyAdventure(game);
    await saveRanks(game._id, game.mode);
    return true;
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

async function startMinigame(gameId: mongoose.Types.ObjectId, round: number, kind: MinigameKind) {
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
      $push: { minigameRounds: round, minigameKinds: kind },
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
  if (isScoredMinigame(kind)) {
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
      players.map(async (p) => {
        const seg = WHEEL[p.minigames.find((m) => m.round === round)?.value ?? WHEEL.length - 1] ?? WHEEL[WHEEL.length - 1];
        // O'quvchi o'yinida coin/sovg'a qutisi yo'q: Super priz va Super baraban o'rniga +300 ochko
        const studentPrize = Boolean(game.studentGame) && Boolean(prizeOf(seg.effect));
        const pts = wheelPoints(seg.effect) + (studentPrize ? 300 : 0);
        const prize = game.studentGame ? null : prizeOf(seg.effect);
        if (studentPrize) big.push(`✨ ${p.name} g'ildirakdan +300 ochko yutdi!`);
        if (seg.effect === "p500") big.push(`${p.name} g'ildirakdan +500 yutdi!`);
        if (prize === "box") big.push(`🎁 ${p.name} SUPER PRIZ yutdi!`);
        if (prize === "superWheel") big.push(`🎡 ${p.name} SUPER BARABAN yutdi!`);
        await LiveGamePlayer.updateOne(
          { _id: p._id, "minigames.round": round },
          { $inc: { score: pts }, $set: { "minigames.$.points": pts, ...(seg.effect === "double" ? { double: true } : {}) } }
        );
        // Sovg'a o'yin oxirida ochiladi (bir round — bitta sovg'a)
        if (prize) {
          await LiveGamePlayer.updateOne(
            { _id: p._id, "prizes.round": { $ne: round } },
            { $push: { prizes: { round, kind: prize, coins: 0, segment: -1, openedAt: null } } }
          );
        }
      })
    );
    if (big.length > 0) await pushEvents(game._id, big.map((text) => ({ text, kind: "info" as const })));
  }
  await saveRanks(game._id, game.mode);
  return true;
}

/**
 * Jang bosqichi boshlanadi: avval xarita uchun ovoz berish (MAP_VOTE_S), keyin `resolveArenaVote` g'olib xaritada
 * o'yinchilarni joylashtiradi va jang boshlanadi. Ovoz paytidagi startedAt/endsAt — taxminiy, ovozdan keyin qayta yoziladi.
 */
async function startArena(gameId: mongoose.Types.ObjectId, round: number, seconds: number, teams = false) {
  const voteEndsAt = new Date(Date.now() + MAP_VOTE_S * 1000);
  const startedAt = new Date(voteEndsAt.getTime() + PVP_INTRO_S * 1000);
  const endsAt = new Date(startedAt.getTime() + seconds * 1000);
  const res = await LiveGame.updateOne(
    { _id: gameId, arenaRounds: { $ne: round }, status: { $in: ["reveal", "minigame"] } },
    {
      $set: {
        status: "arena",
        arena: { round, map: null, voteEndsAt, seconds, teams, startedAt, endsAt, endedAt: null, pickups: [], nextPickupAt: 0, seq: 0, feed: [] },
        questionStartedAt: null,
      },
      $push: { arenaRounds: round },
    }
  );
  if (res.modifiedCount === 0) return;
  // Oldingi jangdagi holat ko'rinmasin (bonuslari allaqachon ochkoga qo'shilgan)
  await LiveGamePlayer.updateMany({ gameId }, { $set: { arena: null } });
}

/** Ovoz berish tugadi (yoki hamma ovoz berdi): xarita tanlanadi, o'yinchilar joylashtiriladi, jang boshlanadi */
async function resolveArenaVote(gameId: mongoose.Types.ObjectId | string): Promise<boolean> {
  const game = await LiveGame.findById(gameId).select("status arena").lean();
  const a = game?.arena;
  if (!game || game.status !== "arena" || !a || !a.voteEndsAt || a.map || typeof a.round !== "number") return false;
  const votes = await LiveGamePlayer.find({ gameId: game._id, "arenaVote.round": a.round }).select("arenaVote").lean();
  const map = pickMap(votes.map((v) => v.arenaVote?.map));
  const startedAt = new Date(Date.now() + PVP_INTRO_S * 1000);
  const endsAt = new Date(startedAt.getTime() + (a.seconds || PVP_SECONDS) * 1000);
  // Bir marta: parallel chaqiruvlardan faqat bittasi
  const res = await LiveGame.updateOne(
    { _id: game._id, status: "arena", "arena.round": a.round, "arena.voteEndsAt": { $ne: null } },
    { $set: { "arena.map": map, "arena.voteEndsAt": null, "arena.startedAt": startedAt, "arena.endsAt": endsAt } }
  );
  if (res.modifiedCount === 0) return false;
  // Jon, qurol, qahramon va joy — to'g'ri javoblarga qarab, tanlangan xaritada
  await setupPvp(game._id, startedAt, Boolean(a.teams), map);
  await pushEvents(game._id, [{ text: `🗺️ Jang xaritasi: ${mapOf(map).emoji} ${mapOf(map).name}`, kind: "info" }]);
  return true;
}

/**
 * Ovoz hal qilinadigan paytmi: vaqt tugadi yoki hamma ovoz berdi. Bu tekshiruv har holat so'rovida (o'quvchi va
 * proyektor) bajariladi — proyektor tabi yashirin yoki internet uzilgan bo'lsa ham o'yin qotib qolmaydi.
 */
function voteDue(game: Pick<ILiveGame, "status" | "arena">, players: { arenaVote?: { round: number } | null }[]): boolean {
  const a = game.arena;
  if (game.status !== "arena" || !a?.voteEndsAt || a.map) return false;
  if (Date.now() >= new Date(a.voteEndsAt).getTime()) return true;
  return players.length > 0 && players.every((p) => p.arenaVote?.round === a.round);
}

/** Proyektor: ovoz vaqti tugaganda yoki hamma ovoz berganda (yoki ustoz "Hozir boshlash" bosganda) */
export async function resolveArenaVoteAction(gameId: string): Promise<Result<{ resolved: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { resolved: await resolveArenaVote(gameId) } };
  } catch (err) {
    return errorOf(err, "Xaritani tanlab bo'lmadi");
  }
}

/** O'quvchi: jang xaritasi uchun ovoz (ovoz tugaguncha o'zgartirish mumkin) */
export async function voteArenaMapAction(gameId: string, round: number, map: string): Promise<Result<{ map: MapId }>> {
  try {
    const user = await requireStudent();
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId) || !Number.isInteger(round) || !isMapId(map)) return fail("Ovoz berib bo'lmaydi");
    await connectDB();
    const game = await LiveGame.findById(gameId).select("groupId grade status arena.round arena.voteEndsAt arena.map").lean();
    const a = game?.arena;
    if (!game || !(await mayPlay(game, user.groupId))) return fail("O'yin topilmadi");
    if (game.status !== "arena" || !a?.voteEndsAt || a.map || a.round !== round) return fail("Ovoz berish tugadi");
    if (Date.now() > new Date(a.voteEndsAt).getTime() + 1500) return fail("Ovoz berish tugadi");
    const res = await LiveGamePlayer.updateOne({ gameId: game._id, studentId: user.userId }, { $set: { arenaVote: { round, map } } });
    if (res.matchedCount === 0) return fail("Avval o'yinga qo'shiling");
    return { success: true, data: { map } };
  } catch (err) {
    return errorOf(err, "Ovozni saqlab bo'lmadi");
  }
}

/**
 * Kosmik poyga boshlanadi: trassa urug'i, sanoq va har o'yinchiga kema rangi va turbo zaryadlari
 * (shu bosqichdagi to'g'ri javoblarga qarab; finalda — butun o'yin bo'yicha).
 */
async function startGalaxy(gameId: mongoose.Types.ObjectId, round: number, final: boolean) {
  const startedAt = new Date(Date.now() + GALAXY_INTRO_S * 1000);
  const endsAt = new Date(startedAt.getTime() + (final ? GALAXY_FINAL_SECONDS : GALAXY_SECONDS) * 1000);
  const res = await LiveGame.updateOne(
    { _id: gameId, galaxyRounds: { $ne: round }, status: { $in: ["reveal", "minigame"] } },
    {
      $set: {
        status: "galaxy",
        galaxy: { round, final, seed: seedOf(`${gameId}:${round}`), startedAt, endsAt, endedAt: null },
        questionStartedAt: null,
      },
      $push: { galaxyRounds: round },
    }
  );
  if (res.modifiedCount === 0) return;
  const players = await LiveGamePlayer.find({ gameId }).select("answers createdAt").sort({ createdAt: 1 }).lean();
  if (players.length === 0) return;
  await LiveGamePlayer.bulkWrite(
    players.map((p, i) => {
      const correct = p.answers.filter((a) => a.isCorrect && (final || a.index > round - GALAXY_EVERY)).length;
      return {
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              galaxy: { round, d: 0, x: 0, orbs: 0, turbo: galaxyTurbo(correct, final), ship: i % SHIP_COLORS.length, points: 0, place: 0 },
            },
          },
        },
      };
    })
  );
}

/** Poyga tugadi: o'rinlar va kristallar bo'yicha ochko qo'shiladi (bir marta) */
async function endGalaxy(gameId: mongoose.Types.ObjectId | string): Promise<boolean> {
  const game = await LiveGame.findOneAndUpdate(
    { _id: gameId, status: "galaxy", "galaxy.endedAt": null },
    { $set: { "galaxy.endedAt": new Date() } },
    { returnDocument: "after" }
  );
  const g = game?.galaxy;
  if (!game || !g) return false;
  const players = await LiveGamePlayer.find({ gameId: game._id, "galaxy.round": g.round }).select("name galaxy").lean();
  const order = galaxyStandings(players.map((p) => ({ id: p._id.toString(), name: p.name, d: p.galaxy?.d ?? 0, orbs: p.galaxy?.orbs ?? 0 })));
  await Promise.all(
    order.map((r, i) => {
      const pts = galaxyPoints(i + 1, r.orbs, g.final);
      return LiveGamePlayer.updateOne(
        { _id: r.id, "galaxy.round": g.round },
        { $inc: { score: pts }, $set: { "galaxy.points": pts, "galaxy.place": i + 1 } }
      );
    })
  );
  if (order[0]) {
    await pushEvents(game._id, [{ text: `🚀 ${order[0].name} ${g.final ? "final " : ""}poygada birinchi! (${Math.round(order[0].d)} m)`, kind: "info" }]);
  }
  await saveRanks(game._id, game.mode);
  return true;
}

export async function endGalaxyAction(gameId: string): Promise<Result<{ ended: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { ended: await endGalaxy(gameId) } };
  } catch (err) {
    return errorOf(err, "Poygani yakunlab bo'lmadi");
  }
}

export interface LiveGalaxyRow {
  id: string;
  name: string;
  d: number;
  orbs: number;
  ship: number;
  points: number;
  place: number;
}

export interface LiveGalaxyView {
  round: number;
  final: boolean;
  seed: number;
  startsInMs: number;
  remainingMs: number;
  ended: boolean;
  /** Masofa bo'yicha tartiblangan */
  rows: LiveGalaxyRow[];
}

function galaxyView(game: Pick<ILiveGame, "galaxy" | "status">, players: ILiveGamePlayer[]): LiveGalaxyView | null {
  const g = game.galaxy;
  if (game.status !== "galaxy" || !g) return null;
  const now = Date.now();
  const rows = galaxyStandings(
    players
      .filter((p) => p.galaxy?.round === g.round)
      .map((p) => ({
        id: p._id.toString(),
        name: p.name,
        d: Math.round(p.galaxy?.d ?? 0),
        orbs: p.galaxy?.orbs ?? 0,
        ship: p.galaxy?.ship ?? 0,
        points: p.galaxy?.points ?? 0,
        place: p.galaxy?.place ?? 0,
      }))
  );
  return {
    round: g.round,
    final: Boolean(g.final),
    seed: g.seed,
    startsInMs: Math.max(0, new Date(g.startedAt).getTime() - now),
    remainingMs: Math.max(0, new Date(g.endsAt).getTime() - now),
    ended: Boolean(g.endedAt),
    rows,
  };
}


/**
 * "Yashil zona" raundi boshlanadi: robotlar maydon o'rtasida, tezlik — shu bosqichdagi to'g'ri javoblarga qarab.
 * `mini` — boshqa rejimdagi qisqa o'yin sifatida (shu savolning qisqa o'yini ham o'ynalgan hisoblanadi).
 */
async function startZone(gameId: mongoose.Types.ObjectId, round: number, final: boolean, mini = false) {
  const rt = await zoneRealtimeEnabled();
  const startedAt = new Date(Date.now() + ZONE_INTRO_S * 1000);
  const endsAt = new Date(startedAt.getTime() + zoneDurationMs(final));
  const res = await LiveGame.updateOne(
    { _id: gameId, zoneRounds: { $ne: round }, status: { $in: ["reveal", "minigame"] } },
    {
      $set: {
        status: "zone",
        zone: { round, final, mini, seed: seedOf(`${gameId}:zone:${round}`), startedAt, endsAt, resolved: 0, rt, endedAt: null },
        questionStartedAt: null,
      },
      $push: mini ? { zoneRounds: round, minigameRounds: round, minigameKinds: "zone" } : { zoneRounds: round },
    }
  );
  if (res.modifiedCount === 0) return;
  const players = await LiveGamePlayer.find({ gameId }).select("answers createdAt").sort({ createdAt: 1 }).lean();
  if (players.length === 0) return;
  await LiveGamePlayer.bulkWrite(
    players.map((p, i) => {
      const correct = p.answers.filter((a) => a.isCorrect && (final || a.index > round - ZONE_EVERY)).length;
      const pos = zoneSpawn(i, players.length);
      return {
        updateOne: {
          filter: { _id: p._id },
          update: {
            $set: {
              zone: {
                round,
                x: pos.x,
                y: pos.y,
                at: 0,
                speed: zoneSpeed(final ? Math.ceil(correct / 2) : correct),
                color: i % ROBOT_COLORS.length,
                out: false,
                outWave: -1,
                stars: 0,
                points: 0,
                place: 0,
                seatWave: -1,
                seatZone: -1,
                seatAt: 0,
              },
            },
          },
        },
      };
    })
  );
}

/** Raund tugadi: qolgan to'lqinlar hisoblanadi, omon qolish va yulduzlar uchun ochko (bir marta) */
async function endZone(gameId: mongoose.Types.ObjectId | string): Promise<boolean> {
  const current = await LiveGame.findById(gameId).select("groupId status zone").lean();
  if (!current?.zone || current.status !== "zone" || current.zone.endedAt) return false;
  // Vaqt tugagan bo'lsa — oxirgi to'lqinlar ham hisoblansin (muddatidan oldin tugatilsa — hisoblanganicha).
  // Real vaqt xonasi natijani o'zi yuboradi; yetib kelmagan bo'lsa — oxirgi saqlangan joylar bo'yicha shu yerda
  await resolveZoneWaves(current as Parameters<typeof resolveZoneWaves>[0], Date.now(), true);
  const game = await LiveGame.findOneAndUpdate(
    { _id: gameId, status: "zone", "zone.endedAt": null },
    { $set: { "zone.endedAt": new Date() } },
    { returnDocument: "after" }
  );
  const z = game?.zone;
  if (!game || !z) return false;
  const waves = zoneWaveCount(Boolean(z.final));
  const played = Math.min(waves, z.resolved ?? 0);
  const players = await LiveGamePlayer.find({ gameId: game._id, "zone.round": z.round }).select("name zone").lean();
  const scored = players
    .map((p) => {
      const survived = p.zone?.out ? Math.max(0, p.zone.outWave ?? 0) : played;
      return { id: p._id.toString(), name: p.name, pts: zonePoints(survived, waves, p.zone?.stars ?? 0, Boolean(z.final)), survivor: !p.zone?.out };
    })
    .sort((a, b) => b.pts - a.pts);
  await Promise.all(
    scored.map((r, i) =>
      LiveGamePlayer.updateOne({ _id: r.id, "zone.round": z.round }, { $inc: { score: r.pts }, $set: { "zone.points": r.pts, "zone.place": i + 1 } })
    )
  );
  const survivors = scored.filter((r) => r.survivor);
  if (survivors.length > 0) {
    const names = survivors.slice(0, 3).map((r) => r.name).join(", ");
    await pushEvents(game._id, [{ text: `🟢 Zonada omon qoldi: ${names}${survivors.length > 3 ? ` va yana ${survivors.length - 3} kishi` : ""}`, kind: "info" }]);
  }
  await saveRanks(game._id, game.mode);
  return true;
}

export async function endZoneAction(gameId: string): Promise<Result<{ ended: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { ended: await endZone(gameId) } };
  } catch (err) {
    return errorOf(err, "Raundni yakunlab bo'lmadi");
  }
}

export interface LiveZoneRow {
  id: string;
  name: string;
  color: number;
  out: boolean;
  outWave: number;
  stars: number;
  points: number;
  place: number;
}

export interface LiveZoneView {
  round: number;
  final: boolean;
  /** Boshqa rejimdagi qisqa o'yin sifatida */
  mini: boolean;
  seed: number;
  startsInMs: number;
  remainingMs: number;
  /** Boshlanish va tugash (server soati, ms) — telefonlar xona soatiga moslab hisoblaydi */
  startAt: number;
  endAt: number;
  /** Hisoblangan to'lqinlar */
  resolved: number;
  ended: boolean;
  rows: LiveZoneRow[];
  /** Real vaqt xonasi manzili (proyektor — tomoshabin); null — HTTP yo'li */
  ws?: string | null;
}

function zoneView(game: Pick<ILiveGame, "zone" | "status">, players: ILiveGamePlayer[]): LiveZoneView | null {
  const z = game.zone;
  if (game.status !== "zone" || !z) return null;
  const now = Date.now();
  const rows = players
    .filter((p) => p.zone?.round === z.round)
    .map((p) => ({
      id: p._id.toString(),
      name: p.name,
      color: p.zone?.color ?? 0,
      out: Boolean(p.zone?.out),
      outWave: p.zone?.outWave ?? -1,
      stars: p.zone?.stars ?? 0,
      points: p.zone?.points ?? 0,
      place: p.zone?.place ?? 0,
    }))
    .sort((a, b) => (z.endedAt ? a.place - b.place : Number(a.out) - Number(b.out) || b.stars - a.stars));
  return {
    round: z.round,
    final: Boolean(z.final),
    mini: Boolean(z.mini),
    seed: z.seed,
    startsInMs: Math.max(0, new Date(z.startedAt).getTime() - now),
    remainingMs: Math.max(0, new Date(z.endsAt).getTime() - now),
    startAt: new Date(z.startedAt).getTime(),
    endAt: new Date(z.endsAt).getTime(),
    resolved: z.resolved ?? 0,
    ended: Boolean(z.endedAt),
    rows,
  };
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
    activeByGroup.clear();
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
  effect: { kind: string; text: string; delta: number; items: string[]; zaps?: { to: string; m: number; blocked: boolean }[] } | null;
  /** Sarguzasht rejimlari: shu savolda tanlangan taktika */
  tactic: string | null;
  /** Personaj (eski o'yinlarda — null, standart chiziladi) */
  look: GameLook | null;
  /** Kutish zalidagi harakat (so'nggi soniyalarda bosilgan bo'lsa) */
  emote: { id: string; at: number } | null;
  /** Kutish zalida: shu o'yinchi kimnidir itarmoqda / uni kimdir itardi (so'nggi soniyalarda) */
  push: { to: string; dir: PushDir; at: number } | null;
  pushedBy: { from: string; dir: PushDir; at: number } | null;
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
      .sort((a, b) => (minigameBetter(m.kind, a.value, b.value) ? -1 : minigameBetter(m.kind, b.value, a.value) ? 1 : 0)),
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
  /** Jang xaritasi (ovoz paytida — hali tanlanmagan, klassik ko'rsatiladi) */
  map: MapId;
  /** Xarita uchun ovoz berish (davom etayotgan bo'lsa) */
  vote: { endsInMs: number; counts: Record<MapId, number>; voted: number; total: number } | null;
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- outAt faqat saralash uchun, javobga kirmaydi
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
    map: mapOf(a.map).id,
    vote:
      a.voteEndsAt && !a.map
        ? (() => {
            const counts = Object.fromEntries(MAP_IDS.map((id) => [id, 0])) as Record<MapId, number>;
            let voted = 0;
            for (const p of players) {
              const v = p.arenaVote;
              if (v && v.round === (a.round ?? -1) && isMapId(v.map)) {
                counts[v.map]++;
                voted++;
              }
            }
            return { endsInMs: Math.max(0, new Date(a.voteEndsAt).getTime() - now), counts, voted, total: players.length };
          })()
        : null,
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
  /** "Yashil zona" (davom etayotgan bo'lsa) va shu natijadan keyin raund bo'ladimi */
  zone: LiveZoneView | null;
  zoneNext: boolean;
  /** "Galaktika poygasi 3D" (davom etayotgan bo'lsa) */
  galaxy: LiveGalaxyView | null;
  /** Shu natijadan keyin (yoki oxirida) poyga bo'ladimi */
  galaxyNext: boolean;
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

/** So'nggi itarishlar: kim → kimni */
function recentPushes(players: ILiveGamePlayer[]): Map<string, { from: string; dir: PushDir; at: number }> {
  const now = Date.now();
  const m = new Map<string, { from: string; dir: PushDir; at: number }>();
  for (const p of players) if (p.push && isFresh(p.push.at, PUSH_MS, now)) m.set(p.push.to, { from: p._id.toString(), dir: p.push.dir, at: p.push.at });
  return m;
}

const toRows = (players: ILiveGamePlayer[], mode: LiveGameMode, index: number, pushed = recentPushes(players)): LivePlayerRow[] =>
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
      effect:
        p.effect && p.effect.index === index
          ? { kind: p.effect.kind, text: p.effect.text, delta: p.effect.delta, items: p.effect.items ?? [], zaps: (p.effect.zaps ?? []).map((z) => ({ to: z.to, m: z.m, blocked: Boolean(z.blocked) })) }
          : null,
      tactic: ans?.tactic ?? null,
      look: (p.look as GameLook | null | undefined) ?? null,
      emote: p.emote && isFresh(p.emote.at, EMOTE_MS, Date.now()) ? { id: p.emote.id, at: p.emote.at } : null,
      push: p.push && isFresh(p.push.at, PUSH_MS, Date.now()) ? { to: p.push.to, dir: p.push.dir, at: p.push.at } : null,
      pushedBy: pushed.get(p._id.toString()) ?? null,
    };
  });

export async function getLiveHostStateAction(gameId: string): Promise<Result<LiveHostState>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    let game = await LiveGame.findById(gameId).lean();
    if (!game) return fail("O'yin topilmadi");
    const [firstPlayers, group] = await Promise.all([
      LiveGamePlayer.find({ gameId: game._id }).lean<(ILiveGamePlayer & { _id: mongoose.Types.ObjectId })[]>(),
      Group.findById(game.groupId).select("name").lean(),
    ]);
    let players = firstPlayers;
    if (voteDue(game, players) && (await resolveArenaVote(game._id))) {
      invalidateLiveSnapshot(gameId);
      game = (await LiveGame.findById(gameId).lean()) ?? game;
      players = await LiveGamePlayer.find({ gameId: game._id }).lean<(ILiveGamePlayer & { _id: mongoose.Types.ObjectId })[]>();
    }
    // Mentor o'quvchi o'yinini kuzatayotganda ham o'yin o'zi yuraveradi
    if (game.studentGame && (await autopilot({ game, players }))) {
      game = (await LiveGame.findById(gameId).lean()) ?? game;
      players = await LiveGamePlayer.find({ gameId: game._id }).lean<(ILiveGamePlayer & { _id: mongoose.Types.ObjectId })[]>();
    }
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
        zone: await (async () => {
          const v = zoneView(game, players);
          return v ? { ...v, ws: v.ended ? null : await zoneSocketUrl(game, null) } : null;
        })(),
        zoneNext:
          game.status === "reveal" &&
          (zoneRoundDue(game.mode, game.index, game.questions.length, game.zoneRounds ?? []) ||
            (game.mode === "zone" && game.index === game.questions.length - 1 && !(game.zoneRounds ?? []).includes(game.index))),
        galaxy: galaxyView(game, players),
        galaxyNext:
          game.status === "reveal" &&
          (galaxyRoundDue(game.mode, game.index, game.questions.length, game.galaxyRounds ?? []) ||
            (game.mode === "galaxy" && game.index === game.questions.length - 1 && !(game.galaxyRounds ?? []).includes(game.index))),
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
  if (c && isFresh(c.at, 15_000, Date.now())) return c.list;
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
    const games = await LiveGame.find({ studentGame: { $ne: true } }).select("groupId mode status questions createdAt").sort({ createdAt: -1 }).limit(60).lean();
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
  if (!game || !(await mayPlay(game, groupId))) return null;
  return game;
}

/** Header va xabar oynasi: o'z guruhida faol o'yin bormi */
export async function getMyActiveLiveGameAction(): Promise<{ id: string; mode: LiveGameMode; status: LiveGameStatus; joined: boolean } | null> {
  const user = await getCurrentUser();
  if (user?.role !== "student" || !user.groupId) return null;
  await connectDB();
  const game = await activeGameOfGroup(user.groupId, await gradeOfGroup(user.groupId));
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
    // Darsni sababsiz qoldirgan — bir necha kun jonli o'yinga kira olmaydi (mentor sozlaydi)
    const rules = (await getAppSettings()).studentGames;
    if (game.studentGame || rules.absenceBanAllGames) {
      const until = await absenceBanUntil(user.userId, rules.absenceBanDays);
      if (until) return fail(absenceBanMessage(until));
    }

    const me = await User.findById(user.userId).select("fullName character level").lean();
    // Personaj: o'yin davomida shu ko'rinishda (keyin profilda o'zgartirsa — keyingi o'yinda)
    const lvl = Math.max(1, me?.level ?? 1);
    const ch = me?.character;
    const rawLook = (ch?.look ?? null) as Record<string, unknown> | null;
    const look = gameLook(cleanLook(rawLook, ch?.owned ?? [], lvl, ch?.power ?? 0, rawLook?.color), lvl);
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
        look: { ...look },
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
        .select({ groupId: 1, grade: 1, status: 1, index: 1, questionStartedAt: 1, mode: 1, bonusIndex: 1, questions: { $slice: [index, 1] } })
        .lean<Pick<ILiveGame, "groupId" | "grade" | "status" | "index" | "questionStartedAt" | "mode" | "bonusIndex" | "questions"> & { _id: mongoose.Types.ObjectId }>(),
      LiveGamePlayer.findOne({ gameId, studentId: user.userId }).select("-minigames -arena").lean<ILiveGamePlayer & { _id: mongoose.Types.ObjectId }>(),
    ]);
    if (!game || !(await mayPlay(game, user.groupId))) return fail("Bu savolga hozir javob berib bo'lmaydi");
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
    // Anti-cheat: inson ulgurmaydigan tezlikdagi javob (skript/bot) — tezlik bali berilmaydi va mentorga qayd etiladi
    const tooFast = elapsed < MIN_HUMAN_ANSWER_MS;
    if (tooFast) void recordCheats(user.userId, "live", gameId, { fast: 1 }).catch(() => {});
    const o = scoreAnswer(game.mode, player, { isCorrect, elapsedMs: tooFast ? q.timeLimit * 1000 : elapsed, limitSec: q.timeLimit, bonus: game.bonusIndex === index });

    // Shartli: bitta savolga ikki marta javob yozilmaydi
    const res = await LiveGamePlayer.updateOne(
      { _id: player._id, "answers.index": { $ne: index }, eliminated: false },
      {
        $push: { answers: { index, value: clean, isCorrect, ms: Math.min(elapsed, q.timeLimit * 1000), points: o.points } },
        $inc: { score: o.points, chests: o.chests },
        $set: { streak: o.streak, lives: o.lives, eliminated: o.eliminated, double: o.double, guard: o.guard, ...(o.eliminated ? { eliminatedAt: index } : {}) },
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
      .select({ groupId: 1, grade: 1, status: 1, index: 1, mode: 1, questionStartedAt: 1, questions: { $slice: [index, 1] } })
      .lean<Pick<ILiveGame, "groupId" | "grade" | "status" | "index" | "mode" | "questionStartedAt" | "questions"> & { _id: mongoose.Types.ObjectId }>();
    if (!game || !(await mayPlay(game, user.groupId))) return fail("O'yin topilmadi");
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

export interface LivePrizeView {
  round: number;
  kind: LivePrizeKind;
  coins: number;
  /** Super barabanda tushgan segment; -1 — hali ochilmagan */
  segment: number;
  opened: boolean;
  /** Personaj sovg'asi (ochilgan bo'lsa) */
  gift: GiftView | null;
}

export interface LivePlayerState {
  id: string;
  mode: LiveGameMode;
  /** O'yin tugaganidan beri o'tgan vaqt (server soati) — telefon avval monitorni ko'rsatadi, keyin o'rinni */
  finishedAgoMs: number | null;
  /** Kutish zali: chap/o'ng qo'shnilar (itarish uchun) va so'nggi itarishlar */
  lobby: {
    /** busy — hozir otishda (otib/otilib bo'lguncha bosib bo'lmaydi) */
    left: { id: string; name: string; look: GameLook | null; busy: boolean } | null;
    right: { id: string; name: string; look: GameLook | null; busy: boolean } | null;
    /** Meni kim itardi (dir — men qaysi tomonga uchdim) */
    pushedBy: { name: string; dir: PushDir; at: number } | null;
    /** Men kimni itardim */
    myPush: { name: string; dir: PushDir; at: number } | null;
  } | null;
  /** O'quvchi yaratgan o'yin: egasi, auditoriya; creator — shu o'quvchi egasimi */
  studentGame: {
    creator: boolean;
    creatorName: string;
    audience: string;
    started: boolean;
    price: number;
    paid: number;
    /** Tayyor o'yin shuncha ms dan keyin o'zi boshlanadi (yangi o'yinchi qo'shilsa — qayta hisoblanadi); 0 — tayyor emas */
    startsInMs: number;
    /** O'yinchilar soni, boshlash uchun kerakli soni va tayyorligi */
    players: number;
    needPlayers: number;
    ready: boolean;
    funded: boolean;
    /** Boshlanmay bekor qilingan (coinlar qaytarilgan) */
    cancelled: boolean;
    /** Bepul o'yin (coin yig'ilmaydi — egasi boshlaydi) */
    free: boolean;
    /** G'oliblar sovrini (jamoaviyda — g'olib jamoa a'zolariga birinchisi) va kerakli o'yinchilar soni */
    prizes: number[];
    minPlayers: number;
    contributors: { name: string; amount: number }[];
    mine: number;
  } | null;
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
    /** O'z personaji */
    look: GameLook | null;
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
    /** Qalqon faol va shu savolda ishlatilgan kuchaytirgichlar */
    guard: boolean;
    boostersNow: string[];
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
    /** Omad g'ildiragidan yutilgan sovg'alar (o'yin oxirida ochiladi) */
    prizes: LivePrizeView[];
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
  /** "Yashil zona": o'z roboti va natijasi */
  zone: {
    round: number;
    final: boolean;
    mini: boolean;
    seed: number;
    startsInMs: number;
    remainingMs: number;
    startAt: number;
    endAt: number;
    ended: boolean;
    joined: boolean;
    x: number;
    y: number;
    speed: number;
    color: number;
    out: boolean;
    outWave: number;
    points: number;
    place: number;
    total: number;
    top: { name: string; points: number; survivor: boolean }[];
    /** Real vaqt xonasi manzili; null — HTTP yo'li */
    ws: string | null;
    /** O'z robotining id si (xona kadrlarida o'zini topish uchun) */
    playerId: string;
  } | null;
  /** "Galaktika poygasi 3D": o'z kemasi, turbo zaryadlari va natijasi */
  galaxy: {
    round: number;
    final: boolean;
    seed: number;
    startsInMs: number;
    remainingMs: number;
    ended: boolean;
    joined: boolean;
    turbo: number;
    ship: number;
    points: number;
    place: number;
    total: number;
    /** Tugaganda: eng yaxshilari */
    top: { name: string; d: number; points: number }[];
  } | null;
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
    map: MapId;
    vote: (NonNullable<LiveArenaView["vote"]> & { myVote: MapId | null }) | null;
    /** O'z qahramoni tayyor (xarita tanlangach joylashtirilgan) */
    ready: boolean;
  } | null;
}

export async function getLivePlayerStateAction(gameId: string): Promise<Result<LivePlayerState>> {
  try {
    const user = await requireStudent();
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    // Umumiy holat — qisqa keshdan (hamma o'quvchi uchun bitta yuklash, ≤400 ms eski). Yuborilgan javobni
    // ekran o'zi eslab qoladi; o'z yozuvi faqat keshda hali bo'lmasa (hozirgina qo'shilgan) alohida o'qiladi
    let snap = await liveSnapshot(gameId);
    if (!snap || !(await mayPlay(snap.game, user.groupId))) return fail("O'yin topilmadi");
    // Xarita uchun ovoz vaqti tugagan (yoki hamma ovoz bergan) — jang shu so'rovda boshlanadi
    if (voteDue(snap.game, snap.players)) {
      await resolveArenaVote(gameId);
      invalidateLiveSnapshot(gameId);
      snap = (await liveSnapshot(gameId)) ?? snap;
    }
    // O'quvchi o'yini: proyektor yo'q — o'yinchilar so'rovi o'yinni oldinga suradi
    if (snap.game.studentGame && (await autopilot(snap))) snap = (await liveSnapshot(gameId)) ?? snap;
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
        lobby: game.status === "lobby" && mine ? lobbyView(players, mine, game.mode) : null,
        finishedAgoMs: game.status === "finished" ? Math.max(0, Date.now() - new Date(game.finishedAt ?? game.createdAt ?? 0).getTime()) : null,
        studentGame: game.studentGame
          ? {
              creator: String(game.creatorId ?? "") === user.userId,
              creatorName: game.creatorName || "O'quvchi",
              audience: typeof game.grade === "number" ? `${game.grade}-sinflar` : group.name,
              started: game.status !== "lobby" || Boolean(game.introAt),
              price: game.price ?? 0,
              paid: game.paid ?? 0,
              funded: Boolean(game.fundedAt),
              cancelled: game.status === "finished" && !game.introAt,
              free: (game.price ?? 0) === 0,
              prizes: game.prizes ?? [],
              minPlayers: game.minPlayers ?? 0,
              players: players.length,
              needPlayers: game.needPlayers ?? 0,
              ready: studentGameReady(game, players.length),
              startsInMs:
                game.status === "lobby" && !game.introAt && studentGameReady(game, players.length)
                  ? Math.max(
                      0,
                      Math.max(game.fundedAt ? new Date(game.fundedAt).getTime() : 0, ...players.map((p) => new Date(p.createdAt ?? 0).getTime())) +
                        (game.autoStartMs || 5 * 60_000) -
                        Date.now()
                    )
                  : 0,
              contributors: contributorsOf(game.contributions),
              mine: (game.contributions ?? []).filter((c) => String(c.studentId) === user.userId).reduce((n, c) => n + c.amount, 0),
            }
          : null,
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
              look: (mine.look as GameLook | null | undefined) ?? null,
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
              guard: Boolean(mine.guard),
              boostersNow: (mine.boostersUsed ?? []).filter((u) => u.index === game.index).map((u) => u.id),
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
              prizes: (mine.prizes ?? []).map((p) => ({
                round: p.round,
                kind: p.kind,
                coins: p.openedAt ? p.coins : 0,
                segment: p.openedAt ? p.segment : -1,
                opened: Boolean(p.openedAt),
                gift: p.openedAt ? giftView(p.gift) : null,
              })),
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
        zone: await (async () => {
          const v = zoneView(game, players);
          if (!v) return null;
          const my = mine?.zone?.round === v.round ? mine.zone : null;
          const ws = mine && my && !v.ended ? await zoneSocketUrl(game, mine) : null;
          return {
            round: v.round,
            final: v.final,
            seed: v.seed,
            startsInMs: v.startsInMs,
            remainingMs: v.remainingMs,
            startAt: v.startAt,
            endAt: v.endAt,
            ended: v.ended,
            mini: v.mini,
            joined: Boolean(my),
            x: my?.x ?? 50,
            y: my?.y ?? 31,
            speed: my?.speed ?? 15,
            color: my?.color ?? 0,
            out: Boolean(my?.out),
            outWave: my?.outWave ?? -1,
            points: my?.points ?? 0,
            place: my?.place ?? 0,
            total: v.rows.length,
            top: v.ended ? v.rows.slice(0, 5).map((r) => ({ name: r.name, points: r.points, survivor: !r.out })) : [],
            ws,
            playerId: mine ? mine._id.toString() : "",
          };
        })(),
        galaxy: (() => {
          const v = galaxyView(game, players);
          if (!v) return null;
          const my = mine?.galaxy?.round === v.round ? mine.galaxy : null;
          return {
            round: v.round,
            final: v.final,
            seed: v.seed,
            startsInMs: v.startsInMs,
            remainingMs: v.remainingMs,
            ended: v.ended,
            joined: Boolean(my),
            turbo: my?.turbo ?? 0,
            ship: my?.ship ?? 0,
            points: my?.points ?? 0,
            place: my?.place ?? 0,
            total: v.rows.length,
            top: v.ended ? v.rows.slice(0, 5).map((r) => ({ name: r.name, d: r.d, points: r.points })) : [],
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
            map: v.map,
            vote: v.vote
              ? { ...v.vote, myVote: mine?.arenaVote?.round === v.round && isMapId(mine.arenaVote.map) ? mine.arenaVote.map : null }
              : null,
            ready: Boolean(a) && !v.vote,
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
    if (!isScoredMinigame(m.kind)) return fail("Bu o'yinda natija yuborilmaydi");
    const now = Date.now();
    if (now < new Date(m.startedAt).getTime() - 500 || now > new Date(m.endsAt).getTime() + MINIGAME_GRACE_MS) return fail("Vaqt tugadi");
    const v = clampMinigameValue(m.kind, value);
    const player = await LiveGamePlayer.findOne({ gameId: game._id, studentId: user.userId }).select("_id").lean();
    if (!player) return fail("Avval o'yinga qo'shiling");
    // Eng yaxshi natija saqlanadi: reaksiyada — eng kichik vaqt (0 — hali yo'q), boshqalarida — eng katta son
    const res =
      m.kind === "reaction"
        ? v > 0
          ? await LiveGamePlayer.updateOne(
              { _id: player._id, minigames: { $elemMatch: { round, $or: [{ value: 0 }, { value: { $gt: v } }] } } },
              { $set: { "minigames.$.value": v } }
            )
          : { matchedCount: 1 }
        : await LiveGamePlayer.updateOne({ _id: player._id, "minigames.round": round }, { $max: { "minigames.$.value": v } });
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
    if (!game || !(await mayPlay(game, user.groupId))) return fail("O'yin topilmadi");
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

/**
 * Omad g'ildiragidan yutilgan sovg'ani ochish (faqat o'yin tugagach): quti — 5–20 coin, super baraban — 5–50 coin.
 * Natija bir marta tanlanadi va saqlanadi; coin `idempotencyKey` bilan bir marta beriladi (qayta bosish, ikki oyna).
 */
export async function openLivePrizeAction(
  gameId: string,
  round: number
): Promise<Result<{ kind: LivePrizeKind; coins: number; segment: number; gift: GiftView | null }>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game) return fail("O'yin topilmadi");
    if (game.status !== "finished") return fail("Sovg'a o'yin tugagach ochiladi");
    if (game.studentGame) return fail("O'quvchilar o'yinida sovg'a berilmaydi");
    const player = await LiveGamePlayer.findOne({ gameId: game._id, studentId: user.userId }).select("prizes").lean();
    const prize = player?.prizes?.find((p) => p.round === round);
    if (!player || !prize) return fail("Sovg'a topilmadi");

    if (!prize.openedAt) {
      // Coin yoki personaj sovg'asi (buyum / kuch +1) — natija shu yerda bir marta tanlanadi
      const u = await User.findById(user.userId).select("character").lean();
      const owned = u?.character?.owned ?? [];
      const power = u?.character?.power ?? 0;
      let segment = -1;
      let coins = 0;
      let gift: string | null = null;
      const giveItem = () => {
        const it = pickGiftItem(owned);
        if (it) gift = `${it.slot}:${it.id}`;
        else coins = GIFT_FALLBACK_COINS;
      };
      if (prize.kind === "superWheel") {
        segment = spinSuperWheel();
        const seg = SUPER_WHEEL[segment];
        coins = seg.coins;
        if (seg.gift === "item") giveItem();
        else if (seg.gift === "power") {
          if (power < MAX_POWER) gift = `power:${power + 1}`;
          else coins = GIFT_FALLBACK_COINS;
        }
      } else if (Math.random() < BOX_GIFT_CHANCE) giveItem();
      else coins = openBox();
      await LiveGamePlayer.updateOne(
        { _id: player._id, prizes: { $elemMatch: { round, openedAt: null } } },
        { $set: { "prizes.$.coins": coins, "prizes.$.segment": segment, "prizes.$.gift": gift, "prizes.$.openedAt": new Date() } }
      );
    }
    // Parallel so'rovda boshqasi oldinroq ochgan bo'lishi mumkin — saqlangan natija olinadi
    const saved = (await LiveGamePlayer.findById(player._id).select("prizes").lean())?.prizes?.find((p) => p.round === round);
    if (!saved?.openedAt) return fail("Sovg'ani ochib bo'lmadi");

    const reason = saved.kind === "box" ? "Jonli o'yinda Super priz qutisi" : "Jonli o'yinda Super baraban";
    if (saved.gift) await grantCharacterGift(user.userId, saved.gift);
    if (saved.coins > 0) {
      await awardCoins({
        studentId: user.userId,
        coin: saved.coins,
        xp: 0,
        type: "bonus",
        description: `${reason}: +${saved.coins} coin`,
        referenceId: game._id,
        idempotencyKey: `live-prize:${game._id}:${user.userId}:${round}`,
        notifyReason: reason,
      });
    }
    invalidateLiveSnapshot(game._id.toString());
    return { success: true, data: { kind: saved.kind, coins: saved.coins, segment: saved.segment, gift: giftView(saved.gift) } };
  } catch (err) {
    return errorOf(err, "Sovg'ani ochib bo'lmadi");
  }
}

/**
 * Kutish zalida personaj harakati (emot): o'quvchi bosadi — proyektorda personaji shu harakatni qiladi.
 * Faqat egalikdagi (bepul yoki sotib olingan) harakat; tez-tez bosilsa (1,2 s ichida) — e'tiborsiz.
 */
export async function playEmoteAction(gameId: string, emoteId: string): Promise<Result<{ played: boolean }>> {
  try {
    const user = await requireStudent();
    const e = emoteOf(String(emoteId));
    if (!e) return fail("Bunday harakat yo'q");
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    // Kutish zalida, javob berib boshqalarni kutayotganda va natija paytida
    if (!game || !["lobby", "question", "reveal"].includes(game.status)) return { success: true, data: { played: false } };
    if (e.price > 0) {
      const me = await User.findById(user.userId).select("character").lean();
      if (!hasEmote(e, me?.character?.owned ?? [])) return fail("Bu harakat hali sizda yo'q — «Personajim» bo'limida oching");
    }
    const now = Date.now();
    const res = await LiveGamePlayer.updateOne(
      { gameId: game._id, studentId: user.userId, $or: [{ emote: null }, { emote: { $exists: false } }, { "emote.at": { $lt: now - EMOTE_GAP_MS } }] },
      { $set: { emote: { id: e.id, at: now } } }
    );
    if (res.modifiedCount > 0) invalidateLiveSnapshot(game._id.toString());
    return { success: true, data: { played: res.modifiedCount > 0 } };
  } catch (err) {
    return errorOf(err, "Harakatni ko'rsatib bo'lmadi");
  }
}

/**
 * Savol paytida kuchaytirgichni ishlatish: zaxiradan bittasi yechiladi (atomik), so'ng ta'siri qo'llanadi.
 * 50/50 — ikkita noto'g'ri variant qaytariladi (telefonda yashiriladi); ×2 — keyingi to'g'ri javob ikki baravar;
 * qalqon — bitta xato kechiriladi. Har savolga har turdan bittadan, bir o'yinda har turdan ko'pi bilan 3 ta.
 */
export async function applyLiveBoosterAction(gameId: string, index: number, id: string): Promise<Result<{ id: string; hide: string[] }>> {
  try {
    const user = await requireStudent();
    const b = boosterOf(id);
    if (!b || !Number.isInteger(index) || index < 0) return fail("Bunday kuchaytirgich yo'q");
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game || game.status !== "question" || game.index !== index) return fail("Kuchaytirgich savol paytida ishlatiladi");
    const q = game.questions[index];
    if (!q || !boosterWorks(b.id, game.mode, q)) return fail(b.id === "fifty" ? "Bu savolda 50/50 ishlamaydi" : "Bu o'yinda bu kuchaytirgich ishlamaydi");
    const player = await LiveGamePlayer.findOne({ gameId: game._id, studentId: user.userId }).select("answers boostersUsed eliminated").lean();
    if (!player || player.eliminated) return fail("Avval o'yinga qo'shiling");
    if (player.answers.some((a) => a.index === index)) return fail("Javob berib bo'lgansiz");
    const used = player.boostersUsed ?? [];
    if (used.some((u) => u.id === b.id && u.index === index)) return fail("Bu savolda ishlatilgan");
    if (used.filter((u) => u.id === b.id).length >= BOOSTER_MAX_PER_GAME) return fail(`Bir o'yinda ko'pi bilan ${BOOSTER_MAX_PER_GAME} ta`);
    // Shartli: shu savol uchun ikki marta yozilmaydi
    const mark = await LiveGamePlayer.updateOne(
      { _id: player._id, boostersUsed: { $not: { $elemMatch: { id: b.id, index } } } },
      { $push: { boostersUsed: { id: b.id, index } } }
    );
    if (mark.modifiedCount === 0) return fail("Bu savolda ishlatilgan");
    const spent = await User.updateOne({ _id: user.userId, [`boosters.${b.id}`]: { $gte: 1 } }, { $inc: { [`boosters.${b.id}`]: -1 } });
    if (spent.modifiedCount === 0) {
      await LiveGamePlayer.updateOne({ _id: player._id }, { $pull: { boostersUsed: { id: b.id, index } } });
      return fail("Bu kuchaytirgich tugagan — «Personajim» bo'limida sotib oling");
    }
    let hide: string[] = [];
    if (b.id === "fifty") {
      const wrong = q.options.filter((o) => !q.correctAnswers.includes(o));
      // Kamida bitta noto'g'ri variant qoladi: 4 variantda — 2 ta, 3 variantda — 1 ta yashiriladi
      hide = [...wrong].sort(() => Math.random() - 0.5).slice(0, Math.max(0, Math.min(2, wrong.length - 1)));
    } else if (b.id === "double") await LiveGamePlayer.updateOne({ _id: player._id }, { $set: { double: true } });
    else await LiveGamePlayer.updateOne({ _id: player._id }, { $set: { guard: true } });
    invalidateLiveSnapshot(game._id.toString());
    return { success: true, data: { id: b.id, hide } };
  } catch (err) {
    return errorOf(err, "Kuchaytirgichni ishlatib bo'lmadi");
  }
}

/** Kanvas o'yinlar uchun: o'yindagi hamma o'yinchilarning personaji (o'yinchi id → ko'rinish) */
export async function getGameLooksAction(gameId: string): Promise<Result<Record<string, GameLook>>> {
  try {
    const me = await getCurrentUser();
    if (!me || !mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await LiveGame.findById(gameId).select("groupId grade mentorId").lean();
    if (!game) return fail("O'yin topilmadi");
    if (me.role === "student" && !(await mayPlay(game, me.groupId))) return fail("O'yin topilmadi");
    const players = await LiveGamePlayer.find({ gameId: game._id }).select("look").lean();
    const out: Record<string, GameLook> = {};
    for (const p of players) if (p.look) out[p._id.toString()] = p.look as unknown as GameLook;
    return { success: true, data: out };
  } catch (err) {
    return errorOf(err, "Personajlarni olib bo'lmadi");
  }
}


// =====================================================================================================
// O'quvchilar yaratadigan o'yinlar: coin evaziga, guruh yoki butun sinf uchun. Server o'zi boshqaradi,
// g'oliblarga mentor belgilagan coin (kamida N o'yinchi bo'lsa), sovg'a qutisi yo'q. Mentor sozlaydi, kuzatadi va to'xtata oladi.
// =====================================================================================================

type AutoStep = "intro" | "advance" | "reveal" | "endMinigame" | "endGalaxy" | "endZone" | "endArena" | "expire";

/** Avto-boshqaruv: hozir qanday qadam kerak (sof hisob; snapshotdan, bazaga murojaatsiz) */
function autopilotDue(
  g: Pick<ILiveGame, "status" | "introAt" | "fundedAt" | "price" | "needPlayers" | "autoStartMs" | "questionStartedAt" | "questions" | "index" | "mode" | "revealedAt" | "minigame" | "galaxy" | "zone" | "arena"> & { createdAt?: Date | string },
  players: (Pick<ILiveGamePlayer, "eliminated" | "answers" | "arena" | "team"> & { createdAt?: Date | string })[],
  now: number
): AutoStep | null {
  const t = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : NaN);
  switch (g.status) {
    case "lobby":
      if (g.introAt) return now >= t(g.introAt) + INTRO_MS ? "advance" : null;
      // Tayyor (coin yig'ilgan, kamida N o'yinchi): egasi yoki mentor boshlaydi; shuncha vaqt yangi o'yinchi
      // qo'shilmasa — o'zi boshlanadi. Tayyor bo'lmasa va lobby uzoq kutsa — bekor (coin qaytadi)
      if (studentGameReady(g, players.length)) {
        const lastJoin = Math.max(t(g.fundedAt as Date | string | null | undefined) || 0, ...players.map((p) => t(p.createdAt) || 0));
        return now - lastJoin >= (g.autoStartMs || 5 * 60_000) ? "intro" : null;
      }
      return now - t(g.createdAt) > STUDENT_LOBBY_MAX_MS ? "expire" : null;
    case "question": {
      if (!g.questionStartedAt) return null;
      const limit = (g.questions[g.index]?.timeLimit ?? 20) * 1000;
      if (now - t(g.questionStartedAt) >= limit) return "reveal";
      const active = players.filter((p) => !p.eliminated);
      if (active.length === 0) return null;
      const mine = (p: (typeof active)[number]) => p.answers.find((a) => a.index === g.index);
      const allDone = active.every((p) => mine(p));
      // Sarguzasht rejimlarida — hamma taktika tanlaguncha (vaqt tugasa baribir ochiladi)
      if (allDone && (!isAdventure(g.mode) || active.every((p) => mine(p)?.tactic))) return "reveal";
      return null;
    }
    case "reveal":
      return g.revealedAt && now - t(g.revealedAt) >= (g.mode === "chest" ? AUTO_REVEAL_CHEST_S : AUTO_REVEAL_S) * 1000 ? "advance" : null;
    case "minigame": {
      const m = g.minigame;
      if (!m) return "advance";
      if (!m.endedAt) return now >= t(m.endsAt) + 1500 ? "endMinigame" : null;
      return now - t(m.endedAt) >= AUTO_MINIGAME_S * 1000 ? "advance" : null;
    }
    case "galaxy": {
      const x = g.galaxy;
      if (!x) return "advance";
      if (!x.endedAt) return now >= t(x.endsAt) + 1800 ? "endGalaxy" : null;
      return now - t(x.endedAt) >= AUTO_REVEAL_S * 1000 ? "advance" : null;
    }
    case "zone": {
      const z = g.zone;
      if (!z) return "advance";
      if (!z.endedAt) return now >= t(z.endsAt) + 1500 ? "endZone" : null;
      return now - t(z.endedAt) >= AUTO_REVEAL_S * 1000 ? "advance" : null;
    }
    case "arena": {
      const a = g.arena;
      if (!a) return "advance";
      // Xarita uchun ovoz — o'quvchilar so'rovi o'zi hal qiladi (voteDue)
      if (a.voteEndsAt) return null;
      if (!a.endedAt) {
        if (now >= t(a.endsAt) + 2000) return "endArena";
        // Bittadan (jamoaviyda — bitta jamoadan) boshqa hamma chiqib ketsa — g'olib aniq
        const fighters = players.filter((p) => p.arena);
        if (now < t(a.startedAt) + 3000 || fighters.length < 2) return null;
        const alive = fighters.filter((p) => !p.arena!.out);
        const decided = a.teams ? new Set(alive.map((p) => p.team)).size <= 1 : alive.length <= 1;
        return decided ? "endArena" : null;
      }
      return now - t(a.endedAt) >= AUTO_REVEAL_S * 1000 ? "advance" : null;
    }
    default:
      return null;
  }
}

// Bir server nusxasida bitta o'yin uchun bir vaqtda bitta qadam (100 ta so'rov bir lahzada kelsa ham)
const autopilotBusy = new Map<string, number>();

/** O'quvchi o'yinini oldinga surish (holat so'rovlari ichidan). Qadam qilingan bo'lsa — true */
async function autopilot(snap: { game: ILiveGame & { _id: mongoose.Types.ObjectId; createdAt?: Date | string }; players: ILiveGamePlayer[] }): Promise<boolean> {
  const g = snap.game;
  if (!g.studentGame || g.status === "finished") return false;
  const step = autopilotDue(g, snap.players, Date.now());
  if (!step) return false;
  const id = g._id.toString();
  const busy = autopilotBusy.get(id);
  if (busy && Date.now() - busy < 5000) return false;
  autopilotBusy.set(id, Date.now());
  try {
    if (step === "intro") await LiveGame.updateOne({ _id: g._id, status: "lobby", introAt: null }, { $set: { introAt: new Date() } });
    else if (step === "advance") await advanceGame(g._id);
    else if (step === "reveal") await revealGame(g._id);
    else if (step === "endMinigame") await endMinigame(g._id);
    else if (step === "endGalaxy") await endGalaxy(g._id);
    else if (step === "endZone") await endZone(g._id);
    else if (step === "endArena") await endArena(g._id);
    else await cancelStudentGame(g._id, "o'yin uchun coin yig'ilmadi");
    invalidateLiveSnapshot(id);
    return true;
  } finally {
    autopilotBusy.delete(id);
  }
}

/** O'quvchi o'yinini to'xtatish; refund — har bir qatnashchiga o'zi qo'shgan coin qaytariladi (bir marta) */
async function cancelStudentGame(gameId: string | mongoose.Types.ObjectId, reason: string, refund = true): Promise<boolean> {
  const game = await LiveGame.findOneAndUpdate(
    { _id: gameId, studentGame: true, status: { $ne: "finished" } },
    { $set: { status: "finished", finishedAt: new Date(), rewardedAt: new Date(), questionStartedAt: null } },
    { returnDocument: "after" }
  ).lean();
  if (!game) return false;
  activeByGroup.clear();
  invalidateLiveSnapshot(game._id.toString());
  if (refund) await refundStudentGame(game, reason);
  return true;
}

/** Hissa qo'shganlar: ism va jami (ko'pidan kamiga) */
function contributorsOf(list: ILiveGame["contributions"]): { name: string; amount: number }[] {
  const m = new Map<string, { name: string; amount: number }>();
  for (const c of list ?? []) {
    const k = String(c.studentId);
    const cur = m.get(k) ?? { name: c.name, amount: 0 };
    cur.amount += c.amount;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

/** Bugun (Toshkent vaqti) boshlangan payt */
const todayStart = () => dateFromKey(toDateKey());

export interface StudentGameSetup {
  enabled: boolean;
  /** Yaratib bo'lmasa — sababi */
  blocked: string | null;
  grade: number | null;
  groupName: string;
  allowGrade: boolean;
  balance: number;
  questions: number;
  dailyLimit: number;
  createdToday: number;
  /** Tur → yig'iladigan narx (guruh uchun, skidka bilan); null — yopiq */
  prices: Record<LiveGameMode, number | null>;
  /** Skidkasiz to'liq narx (ustidan chizib ko'rsatiladi) va skidka miqdori */
  fullPrices: Record<LiveGameMode, number | null>;
  discount: number;
  /** Bepul davr: qachongacha (ISO); null — bepul emas */
  freeUntil: string | null;
  /** Bepul o'yinda g'oliblarga coin berilsinmi */
  freePrizes: boolean;
  /** G'oliblar sovrini (1-, 2-, 3-o'rin), jamoaviyda g'olib jamoaga, kerakli o'yinchilar */
  prizes: number[];
  teamPrize: number;
  minPlayers: number;
  counts: number[];
  /** O'zining faol o'yini */
  myActive: string | null;
}

/** Nima uchun hozir yaratib bo'lmaydi (null — mumkin) */
async function studentGameBlock(user: { userId: string; groupId?: string | null }, audience: StudentGameAudience): Promise<string | null> {
  const settings = (await getAppSettings()).studentGames;
  if (!settings.enabled) return "Mentor hozircha o'quvchilar o'yinini o'chirib qo'ygan";
  if (!user.groupId) return "Siz hali guruhga biriktirilmagansiz";
  const banned = await absenceBanUntil(user.userId, settings.absenceBanDays);
  if (banned) return absenceBanMessage(banned);
  const grade = await gradeOfGroup(user.groupId);
  if (audience === "grade" && (!settings.allowGrade || grade === null)) return "Butun sinf uchun o'yin yopiq";
  const targets =
    audience === "grade" && grade !== null
      ? await Group.find({ grade, isActive: { $ne: false } }).select("_id schedule").lean()
      : await Group.find({ _id: user.groupId }).select("_id schedule").lean();
  const ids = targets.map((g) => g._id);
  if (settings.blockDuringLessons) {
    if (targets.some((g) => isLessonNow(g.schedule))) return "Dars vaqtida o'yin yaratib bo'lmaydi — darsdan keyin urinib ko'ring";
    if (await AttendanceSession.exists({ groupId: { $in: ids }, status: "active" })) return "Hozir dars ketyapti (davomat ochiq) — keyinroq urinib ko'ring";
  }
  const [mentorGame, mine, sameTarget, today] = await Promise.all([
    LiveGame.exists({ ...activeFilter(), groupId: { $in: ids }, studentGame: { $ne: true } }),
    LiveGame.exists({ ...activeFilter(), studentGame: true, creatorId: user.userId }),
    audience === "grade"
      ? LiveGame.exists({ ...activeFilter(), studentGame: true, grade })
      : LiveGame.exists({ ...activeFilter(), studentGame: true, groupId: user.groupId, grade: null }),
    LiveGame.countDocuments({ studentGame: true, creatorId: user.userId, createdAt: { $gte: todayStart() } }),
  ]);
  if (mentorGame) return "Hozir mentor o'yini ketyapti — unga qo'shiling";
  if (mine) return "Sizning o'yiningiz hali tugamagan";
  if (sameTarget) return audience === "grade" ? "Bu sinf uchun boshqa o'quvchi o'yini ketyapti — unga qo'shiling" : "Guruhingizda boshqa o'quvchi o'yini ketyapti — unga qo'shiling";
  if (today >= settings.dailyLimit) return `Bugun ${settings.dailyLimit} ta o'yin yaratdingiz — ertaga yana mumkin`;
  return null;
}

export async function getStudentGameSetupAction(): Promise<Result<StudentGameSetup>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const settings = (await getAppSettings()).studentGames;
    const [grade, group, me, questions, createdToday, myActive, blocked] = await Promise.all([
      gradeOfGroup(user.groupId),
      user.groupId ? Group.findById(user.groupId).select("name").lean() : null,
      User.findById(user.userId).select("spendableBalance").lean(),
      user.groupId ? countLiveQuestions(new mongoose.Types.ObjectId(user.groupId), "all") : 0,
      LiveGame.countDocuments({ studentGame: true, creatorId: user.userId, createdAt: { $gte: todayStart() } }),
      LiveGame.findOne({ ...activeFilter(), studentGame: true, creatorId: user.userId }).select("_id").lean(),
      studentGameBlock(user, "group"),
    ]);
    const prices = {} as Record<LiveGameMode, number | null>;
    const fullPrices = {} as Record<LiveGameMode, number | null>;
    for (const m of MODES) {
      const c = studentGameCost(settings, m, "group");
      prices[m] = c?.price ?? null;
      fullPrices[m] = c?.full ?? null;
    }
    const free = isFreeNow(settings);
    return {
      success: true,
      data: {
        enabled: settings.enabled,
        blocked: blocked && !blocked.startsWith("Butun") ? blocked : null,
        grade,
        groupName: group?.name ?? "",
        allowGrade: settings.allowGrade,
        balance: me?.spendableBalance ?? 0,
        questions,
        dailyLimit: settings.dailyLimit,
        createdToday,
        prices,
        fullPrices,
        discount: free ? 0 : settings.discount,
        freeUntil: free ? settings.freeUntil : null,
        freePrizes: settings.freePrizes,
        prizes: [...settings.prizes],
        teamPrize: settings.teamPrize,
        minPlayers: settings.minPlayersForPrizes,
        counts: [...STUDENT_GAME_COUNTS],
        myActive: myActive?._id.toString() ?? null,
      },
    };
  } catch (err) {
    return errorOf(err, "Ma'lumotlarni olib bo'lmadi");
  }
}

/**
 * Hissa qo'shish: avval coin yechiladi (kalit bilan — bir marta), keyin o'yin hisobiga yoziladi. Yozib bo'lmasa
 * (narx to'lib qoldi yoki o'yin bekor bo'ldi) — coin darhol qaytariladi. Narx to'lsa — fundedAt (endi egasi/mentor boshlaydi).
 */
async function addContribution(
  gameId: mongoose.Types.ObjectId,
  student: { id: string; name: string },
  amount: number,
  key: string,
  title: string
): Promise<Result<{ paid: number; price: number }>> {
  const charge = await awardCoins({
    studentId: student.id,
    coin: -amount,
    xp: 0,
    type: "purchase",
    description: `Jonli o'yinga hissa: ${title}`,
    referenceId: gameId,
    idempotencyKey: `sgame-c:${key}`,
  });
  if (!charge.ok) return fail(charge.reason === "insufficient" ? "Balansingizda yetarli coin yo'q" : "Coin yechib bo'lmadi");
  if (!charge.applied) return fail("Bu hissa allaqachon qo'shilgan");
  const res = await LiveGame.updateOne(
    {
      _id: gameId,
      studentGame: true,
      status: "lobby",
      introAt: null,
      fundedAt: null,
      "contributions.key": { $ne: key },
      $expr: { $lte: [{ $add: ["$paid", amount] }, "$price"] },
    },
    { $inc: { paid: amount }, $push: { contributions: { key, studentId: student.id, name: student.name, amount, at: new Date() } } }
  );
  if (res.modifiedCount === 0) {
    await awardCoins({
      studentId: student.id,
      coin: amount,
      xp: 0,
      type: "adjustment",
      description: `Jonli o'yinga hissa qaytarildi: ${title}`,
      referenceId: gameId,
      idempotencyKey: `sgame-c-back:${key}`,
    });
    return fail("Bu o'yin uchun coin yig'ilib bo'lgan yoki o'yin tugagan");
  }
  await LiveGame.updateOne({ _id: gameId, fundedAt: null, $expr: { $gte: ["$paid", "$price"] } }, { $set: { fundedAt: new Date() } });
  invalidateLiveSnapshot(gameId.toString());
  const after = await LiveGame.findById(gameId).select("paid price").lean();
  return { success: true, data: { paid: after?.paid ?? 0, price: after?.price ?? 0 } };
}

const validNonce = (n: unknown): n is string => typeof n === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(n);

/** O'quvchi o'yin ochadi va birinchi hissani qo'shadi; qolganini qatnashchilar birgalikda yig'adi */
export async function createStudentGameAction(input: {
  mode: LiveGameMode;
  audience: StudentGameAudience;
  count: number;
  /** Yaratuvchining birinchi hissasi (kamida 1 coin) */
  first: number;
  nonce: string;
}): Promise<Result<{ gameId: string }>> {
  try {
    const user = await requireStudent();
    if (!input || !MODES.includes(input.mode) || (input.audience !== "group" && input.audience !== "grade") || !validNonce(input.nonce)) {
      return fail("Ma'lumotlar noto'g'ri");
    }
    const count = (STUDENT_GAME_COUNTS as readonly number[]).includes(Number(input.count)) ? Number(input.count) : 10;
    const rate = checkRateLimit(`sgame_${user.userId}`, 6, 60_000);
    if (!rate.allowed) return fail(`Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring`);
    await connectDB();
    const settings = (await getAppSettings()).studentGames;
    const cost = studentGameCost(settings, input.mode, input.audience);
    if (cost === null) return fail("Bu o'yin turi o'quvchilar uchun yopiq");
    const price = cost.price;
    // Bepul davrda coin yig'ilmaydi — egasi o'zi boshlaydi
    const first = cost.free ? 0 : Math.floor(Number(input.first));
    if (!cost.free && (!Number.isFinite(first) || first < 1 || first > price)) return fail(`Birinchi hissa 1 dan ${price} coingacha bo'lishi kerak`);
    const blocked = await studentGameBlock(user, input.audience);
    if (blocked) return fail(blocked);
    const [me, grade] = await Promise.all([User.findById(user.userId).select("fullName spendableBalance").lean(), gradeOfGroup(user.groupId)]);
    if (!me) return fail("Foydalanuvchi topilmadi");
    if ((me.spendableBalance ?? 0) < first) return fail("Balansingizda yetarli coin yo'q");
    const groupId = new mongoose.Types.ObjectId(user.groupId!);
    const questions = await pickQuestions(groupId, "all", count);
    if (questions.length === 0) return fail("Guruhingiz darslarida test savollari yo'q");

    const title = `${LIVE_MODES[input.mode].title}${input.audience === "grade" ? ` (${grade}-sinflar)` : ""}`;
    const game = await LiveGame.create({
      mentorId: user.userId,
      groupId,
      mode: input.mode,
      source: "all",
      teams: 2,
      // Bepul o'yinda sovrin faqat mentor ruxsat bersa
      prizes: cost.free && !settings.freePrizes ? [0, 0, 0] : studentGamePrizes(settings, input.mode),
      needPlayers: settings.minPlayersToStart,
      autoStartMs: settings.autoStartMin * 60_000,
      minPlayers: settings.minPlayersForPrizes,
      questions,
      options:
        input.mode === "arena"
          ? { minigames: false, arena: true, teamArena: false }
          : input.mode === "galaxy" || input.mode === "zone"
          ? { minigames: false, arena: false, teamArena: false }
          : { minigames: true, arena: false, teamArena: false, zone: true },
      cells: input.mode === "territory" ? emptyCells() : [],
      cracks: input.mode === "bridge" ? makeCracks(bridgeLength(questions.length)) : [],
      studentGame: true,
      creatorId: user.userId,
      creatorName: me.fullName,
      grade: input.audience === "grade" ? grade : null,
      price,
      paid: 0,
    });
    if (!cost.free) {
      const paid = await addContribution(game._id, { id: user.userId, name: me.fullName }, first, `${game._id}:${user.userId}:${input.nonce}`, title);
      if (!paid.success) {
        await LiveGame.deleteOne({ _id: game._id });
        return fail(paid.error);
      }
    }
    activeByGroup.clear();
    await joinLiveGameAction(game._id.toString());
    // E'lon yuborilmasa ham o'yin ochiladi
    await announceStudentGame(game, { name: me.fullName, id: user.userId }, input.audience === "grade" ? grade : null).catch((e) => console.error("Student game announce:", e));
    return { success: true, data: { gameId: game._id.toString() } };
  } catch (err) {
    return errorOf(err, "O'yinni yaratib bo'lmadi");
  }
}

/** O'quvchi o'yini ochilganda guruh (yoki butun sinf) o'quvchilariga Telegram: sovrinlar va "O'yinga qo'shilish" tugmasi; mentorlarga — qisqa xabar */
async function announceStudentGame(game: ILiveGame & { _id: mongoose.Types.ObjectId }, creator: { name: string; id: string }, grade: number | null) {
  const groups =
    grade !== null
      ? await Group.find({ grade, isActive: { $ne: false } }).select("_id name").lean()
      : await Group.find({ _id: game.groupId }).select("_id name").lean();
  const students = await User.find({ role: "student", groupId: { $in: groups.map((g) => g._id) }, _id: { $ne: creator.id }, "telegram.chatId": { $type: "string" } })
    .select("_id")
    .lean();
  const fresh = await LiveGame.findById(game._id).select("paid").lean();
  const audience = grade !== null ? `${grade}-sinflar uchun umumiy o'yin` : `Guruh: ${groups[0]?.name ?? ""}`;
  // Mentorlarga: kim, qaysi tur va kimlar uchun ochgani
  const own = grade !== null ? await Group.findById(game.groupId).select("name").lean() : groups[0];
  notifyMentors("student_game_new", {
    gameId: game._id.toString(),
    creatorName: creator.name,
    groupName: own?.name,
    modeTitle: LIVE_MODES[game.mode].title,
    audience,
    questions: game.questions.length,
    price: game.price ?? 0,
    paid: fresh?.paid ?? 0,
    recipients: students.length,
  });
  if (students.length === 0) return;
  notifyMany(
    students.map((s) => s._id),
    "live_game",
    {
      gameId: game._id.toString(),
      modeTitle: LIVE_MODES[game.mode].title,
      tagline: LIVE_MODES[game.mode].tagline,
      student: {
        creatorName: creator.name,
        audience,
        questions: game.questions.length,
        prizes: [...(game.prizes ?? [])],
        team: game.mode === "team",
        minPlayers: game.minPlayers ?? 0,
        needPlayers: game.needPlayers ?? 0,
        price: game.price ?? 0,
        paid: fresh?.paid ?? 0,
      },
    }
  );
}

/** Qatnashchi o'yinga coin qo'shadi (o'zi ham qo'shiladi). Narx to'lsa o'yin bir necha soniyada boshlanadi */
export async function contributeStudentGameAction(gameId: string, amount: number, nonce: string): Promise<Result<{ paid: number; price: number }>> {
  try {
    const user = await requireStudent();
    const n = Math.floor(Number(amount));
    if (!mongoose.isValidObjectId(gameId) || !Number.isFinite(n) || n < 1 || n > 1000 || !validNonce(nonce)) return fail("Ma'lumotlar noto'g'ri");
    const rate = checkRateLimit(`sgame_c_${user.userId}`, 20, 60_000);
    if (!rate.allowed) return fail(`Juda tez. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring`);
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game || !game.studentGame || game.status !== "lobby" || game.introAt || game.fundedAt) return fail("Bu o'yinga hozir coin qo'shib bo'lmaydi");
    const left = (game.price ?? 0) - (game.paid ?? 0);
    if (n > left) return fail(left > 0 ? `Faqat ${left} coin yetmayapti` : "Coin yig'ilib bo'lgan");
    const me = await User.findById(user.userId).select("fullName").lean();
    if (!me) return fail("Foydalanuvchi topilmadi");
    // Hissa qo'shgan — o'yinga ham qo'shiladi (kira olmasa — coin ham yechilmaydi)
    const joined = await joinLiveGameAction(gameId);
    if (!joined.success) return fail(joined.error);
    return await addContribution(game._id, { id: user.userId, name: me.fullName }, n, `${gameId}:${user.userId}:${nonce}`, LIVE_MODES[game.mode].title);
  } catch (err) {
    return errorOf(err, "Coin qo'shib bo'lmadi");
  }
}

/** O'quvchi o'yinini boshlash (egasi yoki mentor): coin yig'ilgan (yoki bepul) va kamida N o'yinchi bo'lsa */
async function startStudentGame(gameId: string, creatorId: string | null): Promise<Result<{ started: boolean }>> {
  const game = await LiveGame.findOne({ _id: gameId, studentGame: true, ...(creatorId ? { creatorId } : {}) })
    .select("status introAt price fundedAt needPlayers")
    .lean();
  if (!game) return fail("O'yin topilmadi");
  if (game.status !== "lobby" || game.introAt) return fail("O'yin allaqachon boshlangan");
  if ((game.price ?? 0) > 0 && !game.fundedAt) return fail("Avval o'yin uchun coin yig'ilishi kerak");
  const players = await LiveGamePlayer.countDocuments({ gameId: game._id });
  if (players < (game.needPlayers ?? 0)) return fail(`Kamida ${game.needPlayers} ta o'yinchi kerak — hozir ${players} ta`);
  const res = await LiveGame.updateOne({ _id: game._id, status: "lobby", introAt: null }, { $set: { introAt: new Date() } });
  invalidateLiveSnapshot(gameId);
  return { success: true, data: { started: res.modifiedCount > 0 } };
}

/** O'yin egasi (moderator): tayyor o'yinni boshlash */
export async function startStudentGameAction(gameId: string): Promise<Result<{ started: boolean }>> {
  try {
    const user = await requireStudent();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return await startStudentGame(gameId, user.userId);
  } catch (err) {
    return errorOf(err, "O'yinni boshlab bo'lmadi");
  }
}

/** Mentor: o'quvchi o'yinini boshlash (o'sha shartlar bilan) */
export async function startStudentGameByMentorAction(gameId: string): Promise<Result<{ started: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return await startStudentGame(gameId, null);
  } catch (err) {
    return errorOf(err, "O'yinni boshlab bo'lmadi");
  }
}

/** O'yin egasi: coin yig'ilib bo'lmagan o'yinni bekor qilish — har kimga o'z coini qaytariladi */
export async function cancelMyStudentGameAction(gameId: string): Promise<Result<{ cancelled: boolean }>> {
  try {
    const user = await requireStudent();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    const game = await LiveGame.findOne({ _id: gameId, studentGame: true, creatorId: user.userId }).select("status introAt fundedAt").lean();
    if (!game) return fail("O'yin topilmadi");
    if (game.status !== "lobby" || game.introAt) return fail("Boshlangan o'yinni bekor qilib bo'lmaydi");
    return { success: true, data: { cancelled: await cancelStudentGame(gameId, "o'yin egasi bekor qildi") } };
  } catch (err) {
    return errorOf(err, "Bekor qilib bo'lmadi");
  }
}

export interface PlayableGame {
  id: string;
  mode: LiveGameMode;
  status: LiveGameStatus;
  studentGame: boolean;
  creatorName: string | null;
  audience: string;
  players: number;
  joined: boolean;
  mine: boolean;
}

/** O'quvchi: hozir qo'shilish mumkin bo'lgan o'yinlar (mentor o'yini va guruh/sinf o'quvchilari o'yinlari) */
export async function getPlayableGamesAction(): Promise<Result<PlayableGame[]>> {
  try {
    const user = await requireStudent();
    if (!user.groupId) return { success: true, data: [] };
    await connectDB();
    const grade = await gradeOfGroup(user.groupId);
    const games = await LiveGame.find({ ...activeFilter(), $or: [{ groupId: user.groupId }, ...(grade !== null ? [{ studentGame: true, grade }] : [])] })
      .select("mode status studentGame creatorId creatorName grade groupId")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    const ids = games.map((g) => g._id);
    const [counts, mine] = await Promise.all([
      LiveGamePlayer.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([{ $match: { gameId: { $in: ids } } }, { $group: { _id: "$gameId", n: { $sum: 1 } } }]),
      LiveGamePlayer.find({ gameId: { $in: ids }, studentId: user.userId }).select("gameId").lean(),
    ]);
    const n = new Map(counts.map((c) => [String(c._id), c.n]));
    const joined = new Set(mine.map((m) => String(m.gameId)));
    return {
      success: true,
      data: games.map((g) => ({
        id: g._id.toString(),
        mode: g.mode,
        status: g.status,
        studentGame: Boolean(g.studentGame),
        creatorName: g.studentGame ? g.creatorName || "O'quvchi" : null,
        audience: typeof g.grade === "number" ? `${g.grade}-sinflar` : "Guruh",
        players: n.get(g._id.toString()) ?? 0,
        joined: joined.has(g._id.toString()),
        mine: String(g.creatorId ?? "") === user.userId,
      })),
    };
  } catch (err) {
    return errorOf(err, "O'yinlarni olib bo'lmadi");
  }
}

export interface StudentGameMonitorItem {
  id: string;
  mode: LiveGameMode;
  status: LiveGameStatus;
  creatorName: string;
  creatorId: string;
  audience: string;
  groupName: string;
  index: number;
  total: number;
  price: number;
  paid: number;
  /** Boshlash uchun kerakli o'yinchilar va tayyormi (mentor boshlay oladi) */
  needPlayers: number;
  ready: boolean;
  /** Boshlandi — kirish sanog'i ketmoqda (holat hali lobby) */
  starting: boolean;
  contributors: { name: string; amount: number }[];
  refunded: boolean;
  createdAt: string;
  finishedAt: string | null;
  players: { name: string; score: number; out: boolean }[];
}

/** Mentor: o'quvchilar o'yinlari — hozir ketayotganlari va oxirgilari, kimlar o'ynayapti */
export async function getStudentGamesForMentorAction(): Promise<Result<StudentGameMonitorItem[]>> {
  try {
    await requireMentor();
    await connectDB();
    // Mentor kuzatayotganda o'yinlar o'zi oldinga yuradi (o'quvchilar telefonini yopib qo'ygan bo'lsa ham)
    const active = await LiveGame.find({ studentGame: true, status: { $ne: "finished" } }).select("_id").limit(10).lean();
    for (const a of active) {
      const snap = await liveSnapshot(String(a._id));
      if (snap) await autopilot(snap).catch(() => false);
    }
    const games = await LiveGame.find({ studentGame: true })
      .select("mode status creatorName creatorId grade groupId index questions.timeLimit price paid contributions refundedAt createdAt finishedAt fundedAt introAt needPlayers")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    const ids = games.map((g) => g._id);
    const [players, groups] = await Promise.all([
      LiveGamePlayer.find({ gameId: { $in: ids } }).select("gameId name score eliminated").sort({ score: -1 }).lean(),
      Group.find({ _id: { $in: games.map((g) => g.groupId) } }).select("name").lean(),
    ]);
    const groupName = new Map(groups.map((g) => [String(g._id), g.name]));
    const byGame = new Map<string, StudentGameMonitorItem["players"]>();
    for (const p of players) {
      const k = String(p.gameId);
      if (!byGame.has(k)) byGame.set(k, []);
      byGame.get(k)!.push({ name: p.name, score: p.score, out: Boolean(p.eliminated) });
    }
    return {
      success: true,
      data: games.map((g) => ({
        id: g._id.toString(),
        mode: g.mode,
        status: g.status,
        creatorName: g.creatorName || "O'quvchi",
        creatorId: String(g.creatorId ?? ""),
        audience: typeof g.grade === "number" ? `Butun ${g.grade}-sinf` : "Guruh",
        groupName: groupName.get(String(g.groupId)) ?? "—",
        index: g.index,
        total: g.questions.length,
        price: g.price ?? 0,
        paid: g.paid ?? 0,
        needPlayers: g.needPlayers ?? 0,
        ready: g.status === "lobby" && !g.introAt && studentGameReady(g, (byGame.get(g._id.toString()) ?? []).length),
        starting: g.status === "lobby" && Boolean(g.introAt),
        contributors: contributorsOf(g.contributions),
        refunded: Boolean(g.refundedAt),
        createdAt: new Date(g.createdAt ?? Date.now()).toISOString(),
        finishedAt: g.finishedAt ? new Date(g.finishedAt).toISOString() : null,
        players: byGame.get(g._id.toString()) ?? [],
      })),
    };
  } catch (err) {
    return errorOf(err, "O'yinlarni olib bo'lmadi");
  }
}

/** Mentor: o'quvchi o'yinini to'xtatish (xohlasa coin qaytariladi) */
export async function stopStudentGameAction(gameId: string, refund: boolean): Promise<Result<{ stopped: boolean }>> {
  try {
    await requireMentor();
    if (!mongoose.isValidObjectId(gameId)) return fail("O'yin topilmadi");
    await connectDB();
    return { success: true, data: { stopped: await cancelStudentGame(gameId, "mentor to'xtatdi", refund === true) } };
  } catch (err) {
    return errorOf(err, "To'xtatib bo'lmadi");
  }
}


/** Hozir otishda qatnashayotganlar (otuvchi va otilgan) */
function busyInPush(players: Pick<ILiveGamePlayer, "push" | "_id">[], now: number): Set<string> {
  const busy = new Set<string>();
  for (const p of players) {
    if (p.push && now - p.push.at >= 0 && now - p.push.at < PUSH_MS) {
      busy.add(p._id.toString());
      busy.add(p.push.to);
    }
  }
  return busy;
}

/** Telefon uchun kutish zali: qo'shnilar va so'nggi itarishlar */
function lobbyView(players: ILiveGamePlayer[], mine: ILiveGamePlayer, mode: LiveGameMode): NonNullable<LivePlayerState["lobby"]> {
  const order = rankPlayers(
    mode,
    players.map((p) => ({ p, id: p._id.toString(), score: p.score, eliminated: p.eliminated, eliminatedAt: p.eliminatedAt, team: p.team, joinedAt: new Date(p.createdAt ?? 0).getTime() }))
  );
  const myId = mine._id.toString();
  const { left, right } = lobbyNeighbors(order, myId, mode === "team");
  const busy = busyInPush(players, Date.now());
  const view = (x: (typeof order)[number] | null) => (x ? { id: x.id, name: x.p.name, look: (x.p.look as GameLook | null | undefined) ?? null, busy: busy.has(x.id) } : null);
  const byId = new Map(players.map((p) => [p._id.toString(), p]));
  const now = Date.now();
  const incoming = recentPushes(players).get(myId);
  const out = mine.push && isFresh(mine.push.at, PUSH_MS, now) ? mine.push : null;
  return {
    left: view(left),
    right: view(right),
    pushedBy: incoming ? { name: byId.get(incoming.from)?.name ?? "", dir: incoming.dir, at: incoming.at } : null,
    myPush: out ? { name: byId.get(out.to)?.name ?? "", dir: out.dir, at: out.at } : null,
  };
}

/** Kutish zalida chap yoki o'ng qo'shnini hazil qilib itarish (o'ziga, qo'shniga va proyektorda ko'rinadi) */
export async function playPushAction(gameId: string, dir: PushDir): Promise<Result<{ pushed: boolean; name: string; waitMs: number }>> {
  try {
    const user = await requireStudent();
    if (!mongoose.isValidObjectId(gameId) || (dir !== "left" && dir !== "right")) return fail("Ma'lumotlar noto'g'ri");
    await connectDB();
    const game = await loadGameForStudent(gameId, user.groupId);
    if (!game || game.status !== "lobby") return { success: true, data: { pushed: false, name: "", waitMs: 0 } };
    const players = await LiveGamePlayer.find({ gameId: game._id }).select("name score eliminated eliminatedAt team createdAt studentId push").lean();
    const mine = players.find((p) => p.studentId.toString() === user.userId);
    if (!mine) return fail("Avval o'yinga qo'shiling");
    const order = rankPlayers(
      game.mode,
      players.map((p) => ({ id: p._id.toString(), score: p.score, eliminated: p.eliminated, eliminatedAt: p.eliminatedAt, team: p.team, joinedAt: new Date(p.createdAt ?? 0).getTime(), name: p.name }))
    );
    const target = lobbyNeighbors(order, mine._id.toString(), game.mode === "team")[dir];
    if (!target) return fail(dir === "left" ? "Chap tomoningizda hech kim yo'q" : "O'ng tomoningizda hech kim yo'q");
    const now = Date.now();
    // Otish davom etayotganda unda qatnashayotgan ikkalasi (otuvchi ham, otilgan ham) — na otadi, na otiladi
    const busy = busyInPush(players, now);
    if (busy.has(mine._id.toString())) return fail("Otish tugashini kuting");
    if (busy.has(target.id)) return fail(`${target.name.split(" ")[0]} hozir otishda — biroz kuting`);
    const res = await LiveGamePlayer.updateOne(
      { _id: mine._id, $or: [{ push: null }, { push: { $exists: false } }, { "push.at": { $lt: now - PUSH_GAP_MS } }] },
      { $set: { push: { to: target.id, dir, at: now } } }
    );
    if (res.modifiedCount > 0) invalidateLiveSnapshot(game._id.toString());
    // Itargandan keyin 10 soniya qayta itarib bo'lmaydi — qancha qolgani
    const waitMs = res.modifiedCount > 0 ? PUSH_GAP_MS : Math.max(0, (mine.push?.at ?? 0) + PUSH_GAP_MS - now);
    return { success: true, data: { pushed: res.modifiedCount > 0, name: target.name, waitMs } };
  } catch (err) {
    return errorOf(err, "Itarib bo'lmadi");
  }
}
