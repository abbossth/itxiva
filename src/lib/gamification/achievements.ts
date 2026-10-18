import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { ActivityEvent } from "@/lib/db/models/activity-event.model";
import { AttendanceRecord } from "@/lib/db/models/attendance-record.model";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { QuestSubmission } from "@/lib/db/models/quest-submission.model";
import { Quest } from "@/lib/db/models/quest.model";
import { StudentBadge } from "@/lib/db/models/student-badge.model";
import { User } from "@/lib/db/models/user.model";
import { getAppSettings } from "@/lib/settings";
import { dateFromKey } from "@/lib/schedule";
import { awardCoins } from "./award";
import { BADGES, TIER_LABEL, type BadgeId } from "./badges";
import { monthKey } from "./periods";

// Marralar: har bir nishon uchun ko'rsatkich hisoblanadi; yangi bosqichga yetilgan bo'lsa nishon va coin beriladi.

type Id = string | mongoose.Types.ObjectId;
const ATTENDED = ["present", "late"];

/** Oy chegaralari ("2026-10") — Toshkent bo'yicha */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: dateFromKey(`${month}-01`), end: dateFromKey(`${next}-01`) };
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** O'quvchining oydagi davomati: qatnashgan / jami belgilangan darslar */
export async function studentMonthAttendance(studentId: Id, month: string): Promise<{ attended: number; total: number }> {
  const { start, end } = monthRange(month);
  const sessions = await AttendanceSession.find({ date: { $gte: start, $lt: end } }).select("_id").lean();
  const records = await AttendanceRecord.find({ studentId, sessionId: { $in: sessions.map((s) => s._id) } }).select("status").lean();
  return { attended: records.filter((r) => ATTENDED.includes(r.status)).length, total: records.length };
}

/** Guruhlarning oylik davomat foizi (0–100) */
export async function groupMonthAttendance(month: string, groupIds?: Id[]): Promise<Map<string, number>> {
  const { start, end } = monthRange(month);
  const sessions = await AttendanceSession.find({
    date: { $gte: start, $lt: end },
    ...(groupIds ? { groupId: { $in: groupIds } } : {}),
  })
    .select("_id groupId")
    .lean();
  const rows = await AttendanceRecord.aggregate<{ _id: mongoose.Types.ObjectId; total: number; attended: number }>([
    { $match: { sessionId: { $in: sessions.map((s) => s._id) } } },
    { $group: { _id: "$groupId", total: { $sum: 1 }, attended: { $sum: { $cond: [{ $in: ["$status", ATTENDED] }, 1, 0] } } } },
  ]);
  return new Map(rows.filter((r) => r.total > 0).map((r) => [String(r._id), Math.round((r.attended / r.total) * 100)]));
}

/** Tugagan oylardan nechtasida o'quvchi birorta darsni qoldirmagan */
async function fullAttendanceMonths(studentId: mongoose.Types.ObjectId): Promise<number> {
  const rows = await AttendanceRecord.aggregate<{ _id: string; total: number; attended: number }>([
    { $match: { studentId } },
    { $lookup: { from: AttendanceSession.collection.collectionName, localField: "sessionId", foreignField: "_id", as: "s" } },
    { $unwind: "$s" },
    { $group: { _id: { $dateToString: { date: "$s.date", format: "%Y-%m", timezone: "Asia/Tashkent" } }, total: { $sum: 1 }, attended: { $sum: { $cond: [{ $in: ["$status", ATTENDED] }, 1, 0] } } } },
  ]);
  const current = monthKey();
  return rows.filter((r) => r._id < current && r.total > 0 && r.attended === r.total).length;
}

/** Har bir nishon bo'yicha ko'rsatkich */
export async function badgeMetrics(studentIdRaw: Id): Promise<Record<BadgeId, number>> {
  await connectToDatabase();
  const studentId = new mongoose.Types.ObjectId(String(studentIdRaw));
  const [correct, user, attendance, homework, approved] = await Promise.all([
    ActivityEvent.distinct("ref", { studentId, kind: "quiz_answer", correct: true }),
    User.findById(studentId).select("streak").lean(),
    fullAttendanceMonths(studentId),
    HomeworkSubmission.countDocuments({ studentId, status: "graded", score: { $gte: 80 } }),
    QuestSubmission.find({ studentId, status: "approved", auto: false }).select("questId place").lean(),
  ]);
  const quests = await Quest.find({ _id: { $in: [...new Set(approved.map((a) => String(a.questId)))] } })
    .select("template verify evidence")
    .lean();
  const kind = new Map(
    quests.map((q) => [
      String(q._id),
      q.template === "certificate" || (q.verify === "proof" && q.evidence?.certId) ? "certificate" : q.template === "project" ? "project" : "other",
    ])
  );
  return {
    tests: correct.length,
    streak: user?.streak?.best ?? 0,
    attendance,
    homework,
    certificate: approved.filter((a) => kind.get(String(a.questId)) === "certificate").length,
    project: approved.filter((a) => kind.get(String(a.questId)) === "project").length,
    weekly: approved.filter((a) => a.place && a.place <= 3).length,
    quests: approved.length,
  };
}

/** Yangi bosqichga yetilgan nishonlarni beradi (har bosqich bir marta). Natija: yangi nishonlar */
export async function evaluateBadges(studentId: Id): Promise<string[]> {
  const { gamification } = await getAppSettings();
  if (!gamification.enabled) return [];
  await StudentBadge.init();
  const metrics = await badgeMetrics(studentId);
  const owned = new Set(
    (await StudentBadge.find({ studentId }).select("badge tier").lean()).map((b) => `${b.badge}:${b.tier}`)
  );
  const earned: string[] = [];
  for (const def of BADGES) {
    for (const t of def.tiers) {
      if (metrics[def.id] < t.threshold || owned.has(`${def.id}:${t.tier}`)) continue;
      try {
        await StudentBadge.create({ studentId, badge: def.id, tier: t.tier, coins: t.coins });
      } catch (error) {
        if ((error as { code?: number }).code === 11000) continue;
        throw error;
      }
      earned.push(`${def.id}:${t.tier}`);
      if (t.coins > 0) {
        await awardCoins({
          studentId,
          coin: t.coins,
          type: "badge",
          description: `Nishon: ${def.title} · ${TIER_LABEL[t.tier]}`,
          idempotencyKey: `badge:${studentId}:${def.id}:${t.tier}`,
          notifyReason: `Yangi nishon: ${def.title} · ${TIER_LABEL[t.tier]}`,
        });
      }
    }
  }
  return earned;
}
