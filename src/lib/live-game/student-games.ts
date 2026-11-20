import mongoose from "mongoose";
import { Group } from "@/lib/db/models/group.model";
import { LiveGame } from "@/lib/db/models/live-game.model";
import { AttendanceRecord } from "@/lib/db/models/attendance-record.model";
import { formatDateTimeUz, isFresh } from "@/lib/utils";
import { awardCoins } from "@/lib/gamification/award";
import { STUDENT_LOBBY_MAX_MS } from "./student-games-config";

// O'quvchi o'yinlariga kirish: o'yin guruhi yoki (butun sinf uchun ochilgan o'yinda) shu sinfdagi istalgan guruh.
// Bu fayl "use server" emas — server action'lar ichidan chaqiriladi.

const GRADE_TTL_MS = process.env.VITEST ? 0 : 60_000;
const grades = new Map<string, { at: number; grade: number | null }>();

/** Guruhning sinfi (1 daqiqa keshlanadi) */
export async function gradeOfGroup(groupId: string | null | undefined): Promise<number | null> {
  if (!groupId || !mongoose.isValidObjectId(groupId)) return null;
  const c = grades.get(groupId);
  if (c && isFresh(c.at, GRADE_TTL_MS, Date.now())) return c.grade;
  const g = await Group.findById(groupId).select("grade").lean();
  const grade = typeof g?.grade === "number" ? g.grade : null;
  if (grades.size > 500) grades.clear();
  grades.set(groupId, { at: Date.now(), grade });
  return grade;
}

/** O'quvchi shu o'yinda qatnasha oladimi */
export async function mayPlay(
  game: { groupId: unknown; grade?: number | null } | null | undefined,
  groupId: string | null | undefined
): Promise<boolean> {
  if (!game || !groupId) return false;
  if (String(game.groupId) === String(groupId)) return true;
  if (typeof game.grade !== "number") return false;
  return (await gradeOfGroup(groupId)) === game.grade;
}

/** Boshlanmagan o'quvchi o'yini: har bir qatnashchiga o'zi qo'shgan coin qaytariladi (har biriga bir marta — kalit bilan) */
export async function refundStudentGame(
  game: { _id: mongoose.Types.ObjectId; contributions?: { studentId: unknown; amount: number }[] | null },
  reason: string
): Promise<number> {
  const sums = new Map<string, number>();
  for (const c of game.contributions ?? []) sums.set(String(c.studentId), (sums.get(String(c.studentId)) ?? 0) + c.amount);
  let n = 0;
  for (const [studentId, coin] of sums) {
    if (coin <= 0) continue;
    const r = await awardCoins({
      studentId,
      coin,
      xp: 0,
      type: "adjustment",
      description: `Jonli o'yin uchun qo'shgan coiningiz qaytarildi: ${reason}`,
      referenceId: game._id,
      idempotencyKey: `sgame-refund:${game._id}:${studentId}`,
    });
    if (r.ok) n++;
  }
  if (sums.size > 0) await LiveGame.updateOne({ _id: game._id }, { $set: { refundedAt: new Date() } });
  return n;
}

/** Cron: coin yig'ilmagan yoki hech kim boshlamagan o'quvchi o'yinlari bekor qilinadi, coinlar qaytariladi */
export async function expireStudentLobbies(now: Date = new Date()): Promise<number> {
  const stale = await LiveGame.find({
    studentGame: true,
    status: "lobby",
    introAt: null,
    createdAt: { $lt: new Date(now.getTime() - STUDENT_LOBBY_MAX_MS) },
  })
    .select("_id contributions")
    .lean();
  let n = 0;
  for (const g of stale) {
    const res = await LiveGame.updateOne({ _id: g._id, status: "lobby" }, { $set: { status: "finished", finishedAt: now, rewardedAt: now } });
    if (res.modifiedCount === 0) continue;
    await refundStudentGame(g, "o'yin uchun coin yig'ilmadi");
    n++;
  }
  return n;
}

/**
 * Darsni sababsiz qoldirgan o'quvchi: oxirgi `days` kun ichida "absent" yozuvi bo'lsa — cheklov tugash vaqti.
 * Dars keyin sababli deb belgilansa (status "excused") — cheklov o'zi olinadi.
 */
export async function absenceBanUntil(studentId: string, days: number, now: Date = new Date()): Promise<Date | null> {
  if (!days || days <= 0) return null;
  const since = new Date(now.getTime() - days * 86_400_000);
  const rec = await AttendanceRecord.findOne({ studentId, status: "absent", markedAt: { $gte: since } })
    .select("markedAt")
    .sort({ markedAt: -1 })
    .lean();
  return rec ? new Date(new Date(rec.markedAt).getTime() + days * 86_400_000) : null;
}

export const absenceBanMessage = (until: Date) =>
  `Darsni sababsiz qoldirganingiz uchun jonli o'yinlar ${formatDateTimeUz(until)} gacha yopiq`;
