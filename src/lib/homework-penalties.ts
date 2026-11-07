import { connectToDatabase } from "@/lib/db/connect";
import { Lesson } from "@/lib/db/models/lesson.model";
import { User } from "@/lib/db/models/user.model";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { Penalty } from "@/lib/db/models/penalty.model";
import { deductClamped, ensurePenalty } from "@/lib/penalties";
import { notify } from "@/lib/notifications/notify";

// Uyga vazifani muddatida topshirmaganlarga jarima (oy ichidagi zinapoya: −10 / −30 / −50).
// Har 5 daqiqalik cron (/api/cron/reminders) va kunlik cron chaqiradi. Bu fayl "use server" emas.

const DAY_MS = 24 * 60 * 60 * 1000;
/** Juda eski muddatlar uchun jarima qo'llanmaydi */
const LOOKBACK_MS = 14 * DAY_MS;
/** Qoida shu paytdan kuchga kirgan: undan oldingi muddatlar uchun orqaga qarab jarima yo'q */
export const HOMEWORK_PENALTY_SINCE = new Date("2026-11-09T00:00:00+05:00");

/**
 * Muddati o'tgan vazifalar: guruhda hech narsa topshirmagan o'quvchilardan coin olinadi va xabar yuboriladi.
 * Muddatdan keyin topshirish mumkin, lekin olingan jarima qaytarilmaydi.
 * Har bir dars o'z muddati uchun bir marta ko'rib chiqiladi (`homeworkPenaltyDueAt`); bitta vazifa uchun
 * bitta jarima — Penalty unique indeksi kafolatlaydi (cron takror yoki parallel ishlasa ham).
 */
export async function applyMissedHomeworkPenalties(now: Date = new Date()): Promise<{ lessons: number; penalized: number }> {
  await connectToDatabase();
  const since = new Date(Math.max(now.getTime() - LOOKBACK_MS, HOMEWORK_PENALTY_SINCE.getTime()));

  const lessons = await Lesson.find({
    isPublished: true,
    "homework.isEnabled": true,
    "homework.dueAt": { $gt: since, $lte: now },
    $expr: { $ne: ["$homeworkPenaltyDueAt", "$homework.dueAt"] },
  })
    .select("title groupId homework.dueAt")
    .lean();

  let penalized = 0;
  for (const lesson of lessons) {
    const dueAt = new Date(lesson.homework!.dueAt!);
    const [students, submitted] = await Promise.all([
      // Muddatdan keyin qo'shilgan o'quvchi bu vazifa uchun javobgar emas
      User.find({ groupId: lesson.groupId, role: "student", createdAt: { $lte: dueAt } }).select("_id").lean(),
      HomeworkSubmission.find({ lessonId: lesson._id }).select("studentId").lean(),
    ]);
    const done = new Set(submitted.map((s) => s.studentId.toString()));

    for (const student of students) {
      if (done.has(student._id.toString())) continue;
      const { penalty, created } = await ensurePenalty({
        studentId: student._id,
        kind: "homework",
        refId: lesson._id,
        at: dueAt,
        reasonBase: `«${lesson.title}» uyga vazifasi muddatida topshirilmagani uchun`,
      });
      if (!created) continue;

      const { applied, balanceAfter } = await deductClamped(student._id, penalty.wanted);
      if (applied > 0) {
        await Penalty.updateOne({ _id: penalty._id }, { $set: { applied } });
        await CoinLedger.create({
          studentId: student._id,
          amount: -applied,
          xp: 0,
          type: "penalty",
          referenceId: lesson._id,
          description: penalty.reason,
          balanceAfter,
        });
      }
      notify(student._id, "coins_changed", {
        amount: -applied,
        reason: penalty.reason,
        balance: balanceAfter,
        penalty: { wanted: penalty.wanted, no: penalty.no },
      });
      penalized++;
    }
    await Lesson.updateOne({ _id: lesson._id }, { $set: { homeworkPenaltyDueAt: dueAt } });
  }
  return { lessons: lessons.length, penalized };
}
