import mongoose from "mongoose";
import { LiveGame } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer } from "@/lib/db/models/live-game-player.model";
import { awardCoins } from "@/lib/gamification/award";
import { rewardQuizAnswers } from "@/lib/gamification/quiz-rewards";
import { LIVE_MODES, computeAwards } from "./modes";

// Jonli o'yinni yakunlash: 1–3 o'ringa (jamoaviyda g'olib jamoaga) coin, to'g'ri javoblar test savoli sifatida sanaladi.
// Server action va cron (yopilmay qolgan o'yinlar) shu yerdan foydalanadi. Bu fayl "use server" emas.

type Id = string | mongoose.Types.ObjectId;

/** Mentor yopishni unutgan o'yin shuncha vaqtdan keyin yakunlanadi */
export const LIVE_GAME_MAX_MS = 3 * 60 * 60 * 1000;

export async function finishLiveGame(gameId: Id, now: Date = new Date()): Promise<boolean> {
  const game = await LiveGame.findOneAndUpdate(
    { _id: gameId, status: { $ne: "finished" } },
    { $set: { status: "finished", finishedAt: now, questionStartedAt: null } },
    { returnDocument: "after" }
  );
  if (!game) return false;

  const players = await LiveGamePlayer.find({ gameId: game._id }).lean();
  const awards = computeAwards(
    game.mode,
    players.map((p) => ({
      id: p._id.toString(),
      score: p.score,
      eliminated: p.eliminated,
      eliminatedAt: p.eliminatedAt,
      team: p.team,
      joinedAt: new Date(p.createdAt ?? 0).getTime(),
    })),
    game.prizes,
    game.teams
  );
  const byId = new Map(players.map((p) => [p._id.toString(), p]));
  const modeTitle = LIVE_MODES[game.mode].title;

  for (const a of awards) {
    const p = byId.get(a.id);
    if (!p) continue;
    const reason = game.mode === "team" ? `Jonli o'yinda (${modeTitle}) jamoangiz g'olib bo'ldi` : `Jonli o'yinda (${modeTitle}) ${a.place}-o'rin`;
    const res = await awardCoins({
      studentId: p.studentId,
      coin: a.coins,
      type: "bonus",
      description: reason,
      referenceId: game._id,
      idempotencyKey: `live:${game._id}:${p.studentId}`,
      notifyReason: reason,
    });
    if (res.ok) await LiveGamePlayer.updateOne({ _id: p._id }, { $set: { coins: a.coins } });
  }

  // To'g'ri javoblar asl test savoliga javob sifatida sanaladi (kunlik topshiriq; coin har savolga bir marta)
  for (const p of players) {
    const answered = p.answers
      .map((ans) => ({ questionId: game.questions[ans.index]?.sourceQuestionId ?? null, isCorrect: ans.isCorrect }))
      .filter((x): x is { questionId: string; isCorrect: boolean } => Boolean(x.questionId));
    if (answered.length > 0) {
      await rewardQuizAnswers(p.studentId, answered).catch((error) => console.error("Live game quiz reward error:", error));
    }
  }

  await LiveGame.updateOne({ _id: game._id }, { $set: { rewardedAt: new Date() } });
  return true;
}

/** Cron: uzoq vaqt ochiq qolib ketgan o'yinlar */
export async function finishStaleLiveGames(now: Date = new Date()): Promise<number> {
  const stale = await LiveGame.find({ status: { $ne: "finished" }, createdAt: { $lt: new Date(now.getTime() - LIVE_GAME_MAX_MS) } })
    .select("_id")
    .lean();
  let n = 0;
  for (const g of stale) if (await finishLiveGame(g._id, now)) n++;
  return n;
}
