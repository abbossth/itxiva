import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Quest } from "@/lib/db/models/quest.model";
import { QuestSubmission } from "@/lib/db/models/quest-submission.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { getAppSettings } from "@/lib/settings";
import { notify } from "@/lib/notifications/notify";
import { evaluateBadges, groupMonthAttendance, previousMonth, studentMonthAttendance } from "./achievements";
import { monthKey, weekKey } from "./periods";
import { completeAutoQuest } from "./quests";

// Gamifikatsiyaning kunlik cron vazifasi. Hamma qadam idempotent: o'tgan hafta va oy har kuni tekshiriladi,
// allaqachon yakunlangan bo'lsa hech narsa o'zgarmaydi — cron bir kun ishlamay qolsa ham natija yo'qolmaydi.

export interface GamificationCronResult {
  skipped?: boolean;
  badges: number;
  weeklyAnnounced: number;
  challengeRewards: number;
  attendanceRewards: number;
}

/** Auditoriyadagi o'quvchilar (guruhi bilan) */
async function audienceStudents(audience: { groupIds?: unknown[]; grades?: number[] } | undefined) {
  const gids = (audience?.groupIds ?? []).map(String);
  const grades = audience?.grades ?? [];
  const groups = await Group.find(gids.length || grades.length ? { $or: [{ _id: { $in: gids } }, { grade: { $in: grades } }] } : {})
    .select("_id")
    .lean();
  return User.find({ role: "student", groupId: { $in: groups.map((g) => g._id) } }).select("_id groupId").lean();
}

/** O'tgan haftaning haftalik masalalari: qatnashganlarga natija (o'rin tasdiqlanganda berilgan) */
export async function finalizeWeekly(week: string): Promise<number> {
  const period = `w:${week}`;
  const quests = await Quest.find({ verify: "competition", resultsAnnounced: { $ne: period } }).select("title").lean();
  let announced = 0;
  for (const q of quests) {
    const subs = await QuestSubmission.find({ questId: q._id, periodKey: period }).select("studentId status place coins").lean();
    if (subs.length === 0) continue;
    // Shartli belgilash: parallel cron ikki marta xabar yubormaydi
    const res = await Quest.updateOne({ _id: q._id, resultsAnnounced: { $ne: period } }, { $addToSet: { resultsAnnounced: period } });
    if (res.modifiedCount === 0) continue;
    const byStudent = new Map<string, { place: number | null; coins: number }>();
    for (const s of subs) {
      const prev = byStudent.get(String(s.studentId));
      if (!prev || (s.place && (!prev.place || s.place < prev.place))) {
        byStudent.set(String(s.studentId), { place: s.status === "approved" ? s.place ?? null : null, coins: s.coins ?? 0 });
      }
    }
    for (const [studentId, r] of byStudent) {
      notify(studentId, "weekly_result", { questId: String(q._id), title: q.title, place: r.place, coins: r.place ? r.coins : undefined });
    }
    announced++;
  }
  return announced;
}

/** O'tgan oy: guruh chellenji va "to'liq davomat" topshiriqlari */
export async function finalizeMonth(month: string): Promise<{ challenge: number; attendance: number }> {
  const quests = await Quest.find({
    status: "published",
    verify: "auto",
    "autoRule.kind": { $in: ["group_challenge", "month_attendance"] },
  });
  let challenge = 0;
  let attendance = 0;
  for (const quest of quests) {
    const students = await audienceStudents(quest.audience);
    if (quest.autoRule?.kind === "group_challenge") {
      const groupIds = [...new Set(students.map((s) => String(s.groupId)))].map((id) => new mongoose.Types.ObjectId(id));
      const rates = await groupMonthAttendance(month, groupIds);
      for (const st of students) {
        const rate = rates.get(String(st.groupId));
        if (rate === undefined || rate < quest.autoRule.target) continue;
        if (await completeAutoQuest(quest, st._id, st.groupId ?? null, undefined, `m:${month}`)) challenge++;
      }
    } else {
      for (const st of students) {
        const a = await studentMonthAttendance(st._id, month);
        if (a.total === 0 || a.attended < a.total) continue;
        if (await completeAutoQuest(quest, st._id, st.groupId ?? null, undefined, `m:${month}`)) attendance++;
      }
    }
  }
  return { challenge, attendance };
}

export async function runGamificationCron(now: Date = new Date()): Promise<GamificationCronResult> {
  const { gamification } = await getAppSettings();
  if (!gamification.enabled) return { skipped: true, badges: 0, weeklyAnnounced: 0, challengeRewards: 0, attendanceRewards: 0 };
  await connectToDatabase();

  const weeklyAnnounced = await finalizeWeekly(weekKey(new Date(now.getTime() - 7 * 86_400_000)));
  const month = await finalizeMonth(previousMonth(monthKey(now)));

  // Nishonlar: davomat va vazifa kabi ko'rsatkichlar boshqa joyda hisoblanmaydi — kuniga bir marta hammaga
  let badges = 0;
  const students = await User.find({ role: "student", groupId: { $ne: null } }).select("_id").lean();
  for (const s of students) badges += (await evaluateBadges(s._id)).length;

  return { badges, weeklyAnnounced, challengeRewards: month.challenge, attendanceRewards: month.attendance };
}
