"use server";

import mongoose from "mongoose";
import { z } from "zod";
import { requireMentor, requireStudent } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { checkRateLimit } from "@/lib/rate-limit";
import { CHEAT_KINDS, describeCheats, type CheatCounts } from "@/lib/anti-cheat/kinds";
import { recordCheats } from "@/lib/anti-cheat/record";

const reportSchema = z.object({
  context: z.enum(["quiz", "exam", "live"]),
  refId: z.string().refine((v) => mongoose.isValidObjectId(v)),
  // "fast" faqat server tomonidan yoziladi
  counts: z.object(Object.fromEntries(CHEAT_KINDS.filter((k) => k !== "fast").map((k) => [k, z.number().int().min(0).max(50).optional()]))),
});

/** O'quvchi brauzeri: test/imtihon/jonli o'yin paytidagi qoidabuzarliklar (bir necha soniyada bir marta, to'plab) */
export async function reportCheatAction(input: z.input<typeof reportSchema>): Promise<{ success: boolean }> {
  try {
    const user = await requireStudent();
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success) return { success: false };
    if (!checkRateLimit(`cheat_${user.userId}`, 40, 60_000).allowed) return { success: false };
    await connectToDatabase();
    await recordCheats(user.userId, parsed.data.context, parsed.data.refId, parsed.data.counts);
    return { success: true };
  } catch {
    return { success: false };
  }
}

export interface RecentCheat {
  id: string;
  studentName: string;
  where: string;
  context: "quiz" | "exam" | "live";
  total: number;
  text: string;
  lastAt: string;
}

/** Mentor: so'nggi anti-cheat qaydlari (jonli o'yin, test) — kim, qayerda, nima qilgan */
export async function getRecentCheatsAction(limit = 30): Promise<{ success: true; data: RecentCheat[] } | { success: false; error: string }> {
  try {
    await requireMentor();
    await connectToDatabase();
    const { CheatEvent } = await import("@/lib/db/models/cheat-event.model");
    const { User } = await import("@/lib/db/models/user.model");
    const { Quiz } = await import("@/lib/db/models/quiz.model");
    const { LiveGame } = await import("@/lib/db/models/live-game.model");
    const { LIVE_MODES } = await import("@/lib/live-game/modes");
    const rows = await CheatEvent.find({ total: { $gt: 0 }, context: { $in: ["quiz", "live"] } })
      .sort({ lastAt: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .lean();
    const ids = (ctx: string) => rows.filter((r) => r.context === ctx).map((r) => r.refId).filter((v) => mongoose.isValidObjectId(v));
    const [users, quizzes, games] = await Promise.all([
      User.find({ _id: { $in: rows.map((r) => r.studentId) } }).select("fullName").lean(),
      Quiz.find({ _id: { $in: ids("quiz") } }).select("title").lean(),
      LiveGame.find({ _id: { $in: ids("live") } }).select("mode createdAt").lean(),
    ]);
    const name = new Map(users.map((u) => [String(u._id), u.fullName]));
    const quizTitle = new Map(quizzes.map((q) => [String(q._id), q.title]));
    const gameTitle = new Map(games.map((g) => [String(g._id), `Jonli o'yin: ${LIVE_MODES[g.mode]?.title ?? g.mode}`]));
    return {
      success: true,
      data: rows.map((r) => ({
        id: String(r._id),
        studentName: name.get(String(r.studentId)) ?? "Noma'lum",
        where: r.context === "quiz" ? `Test: ${quizTitle.get(r.refId) ?? "—"}` : gameTitle.get(r.refId) ?? "Jonli o'yin",
        context: r.context,
        total: r.total,
        text: describeCheats(r.counts as CheatCounts),
        lastAt: new Date(r.lastAt).toISOString(),
      })),
    };
  } catch {
    return { success: false, error: "Yuklab bo'lmadi" };
  }
}
