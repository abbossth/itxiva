"use server";

// Jonli o'yindagi ovozli suhbat: xonaga kirish bileti va ustozning "hammaning mikrofonini o'chirish" tugmasi.
// Ovoz saytda ham, bazada ham saqlanmaydi — faqat Cloudflare xonasi orqali o'quvchidan o'quvchiga uzatiladi.

import mongoose from "mongoose";
import { unstable_rethrow } from "next/navigation";
import { connectDB } from "@/lib/db/connect";
import { LiveGame } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer } from "@/lib/db/models/live-game-player.model";
import { User } from "@/lib/db/models/user.model";
import { getCurrentUser, requireMentor } from "@/lib/auth/guards";
import { mayPlay } from "@/lib/live-game/student-games";
import { phaseOfGame, pushVoice, voiceRoomReady, voiceSocketUrl } from "@/lib/live-game/voice-server";
import { checkRateLimit } from "@/lib/rate-limit";

type Result<T> = { success: true; data: T } | { success: false; error: string };

function errorOf(err: unknown, fallback: string): { success: false; error: string } {
  unstable_rethrow(err);
  console.error(fallback, err);
  return { success: false, error: fallback };
}

export interface VoiceJoin {
  /** null — ovozli suhbat sozlanmagan yoki o'yin tugagan */
  url: string | null;
  host: boolean;
  muted: boolean;
}

/** Xonaga kirish bileti: o'yinga qo'shilgan o'quvchi yoki mentor */
export async function getVoiceTicketAction(gameId: string): Promise<Result<VoiceJoin>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Tizimga kiring" };
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return { success: false, error: "O'yin topilmadi" };
    const rate = checkRateLimit(`voice_${user.userId}`, 20, 60_000);
    if (!rate.allowed) return { success: false, error: "Juda ko'p urinish — birozdan keyin" };
    await connectDB();
    const game = await LiveGame.findById(gameId)
      .select({ groupId: 1, grade: 1, status: 1, index: 1, questionStartedAt: 1, revealedAt: 1, voice: 1, "questions.timeLimit": 1 })
      .lean();
    if (!game) return { success: false, error: "O'yin topilmadi" };
    const muted = Boolean(game.voice?.muted);
    if (game.status === "finished" || !(await voiceRoomReady())) return { success: true, data: { url: null, host: user.role === "mentor", muted } };
    const phase = phaseOfGame(game);

    let url: string | null;
    if (user.role === "mentor") {
      const me = await User.findById(user.userId).select("fullName").lean();
      url = await voiceSocketUrl(gameId, { p: `host:${user.userId}`, n: me?.fullName || "Ustoz", host: true, muted, phase, answered: true });
    } else {
      if (!(await mayPlay(game, user.groupId))) return { success: false, error: "O'yin topilmadi" };
      const player = await LiveGamePlayer.findOne({ gameId, studentId: user.userId }).select("name eliminated answers.index").lean();
      if (!player) return { success: false, error: "Avval o'yinga qo'shiling" };
      const answered = Boolean(player.eliminated) || (phase.q !== null && player.answers.some((a) => a.index === phase.q));
      url = await voiceSocketUrl(gameId, { p: user.userId, n: player.name, host: false, muted, phase, answered });
    }
    // Shundan keyin o'yin bosqichlari xonaga yuboriladi
    if (!game.voice?.used) await LiveGame.updateOne({ _id: game._id }, [{ $set: { voice: { used: true, muted: { $ifNull: ["$voice.muted", false] } } } }], { updatePipeline: true });
    return { success: true, data: { url, host: user.role === "mentor", muted } };
  } catch (err) {
    return errorOf(err, "Ovozli suhbatga ulanib bo'lmadi");
  }
}

/** Mentor: o'yindagi barcha o'quvchilarning mikrofonini o'chirish / qayta yoqish (masalan, dars paytida) */
export async function setVoiceMutedAction(gameId: string, muted: boolean): Promise<Result<{ muted: boolean }>> {
  try {
    await requireMentor();
    if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return { success: false, error: "O'yin topilmadi" };
    await connectDB();
    const on = muted === true;
    // voice hali yo'q bo'lishi mumkin — butun obyekt yoziladi
    const res = await LiveGame.updateOne({ _id: gameId }, [{ $set: { voice: { used: { $ifNull: ["$voice.used", false] }, muted: on } } }], { updatePipeline: true });
    if (res.matchedCount === 0) return { success: false, error: "O'yin topilmadi" };
    await pushVoice({ g: gameId, t: "muted", muted: on });
    return { success: true, data: { muted: on } };
  } catch (err) {
    return errorOf(err, "Mikrofonlarni o'chirib bo'lmadi");
  }
}
