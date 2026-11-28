import { connectToDatabase } from "@/lib/db/connect";
import { HomeworkSubmission, type HomeworkStatus } from "@/lib/db/models/homework-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { syncLevel } from "@/lib/gamification/award";
import { notify } from "@/lib/notifications/notify";
import { DEFAULT_HOMEWORK_COINS } from "@/lib/homework-status";

// Uyga vazifaga baho qo'yish — mentor ham, AI avtomatik bahosi ham shu yerdan o'tadi:
// baho saqlanadi, coin farqi (qayta baholashda faqat farq) daftarga yoziladi, o'quvchiga xabar boradi.

export type GradeResult = { ok: true; lessonId: string } | { ok: false; message: string };

export async function applyHomeworkGrade(p: {
  submissionId: string;
  score: number;
  feedback: string;
  coins: number;
  /** Mentor id; null — AI avtomatik bahosi */
  gradedBy: string | null;
  /** Faqat shu holatdagi javob baholanadi (AI uchun: "submitted" — mentor bu orada baholab qo'ymagan bo'lsin) */
  onlyIf?: HomeworkStatus;
}): Promise<GradeResult> {
  await connectToDatabase();
  const submission = await HomeworkSubmission.findById(p.submissionId);
  if (!submission) return { ok: false, message: "Javob topilmadi" };
  if (p.onlyIf && submission.status !== p.onlyIf) return { ok: false, message: "Javob holati o'zgargan" };

  const lesson = await Lesson.findById(submission.lessonId).select("title homework").lean();
  const maxCoins = lesson?.homework?.coinsReward ?? DEFAULT_HOMEWORK_COINS;
  if (p.coins > maxCoins) return { ok: false, message: `Coin ${maxCoins} dan oshmasligi kerak` };

  const auto = p.gradedBy === null;
  // Qayta baholashda faqat farq yoziladi — coin ikki marta berilmaydi.
  // Shart bilan yangilash: bir vaqtda ikki marta bosilganda farq bir marta hisoblanadi.
  const previousCoins = submission.coinsAwarded ?? 0;
  const updated = await HomeworkSubmission.findOneAndUpdate(
    { _id: submission._id, coinsAwarded: previousCoins, ...(p.onlyIf ? { status: p.onlyIf } : {}) },
    {
      $set: {
        status: "graded",
        score: p.score,
        feedback: p.feedback,
        coinsAwarded: p.coins,
        gradedAt: new Date(),
        gradedBy: p.gradedBy,
        autoGraded: auto,
      },
    },
    { returnDocument: "after" }
  );
  if (!updated) {
    return { ok: false, message: "Javob hozirgina o'zgartirildi. Sahifani yangilab, qayta urinib ko'ring" };
  }

  const delta = p.coins - previousCoins;
  if (delta !== 0) {
    const student = await User.findByIdAndUpdate(
      submission.studentId,
      // XP ham coin bilan birga o'zgaradi: qayta baholashda kamaygan mukofot XP dan ham qaytariladi
      { $inc: { totalCoins: delta, spendableBalance: delta, xp: delta } },
      { returnDocument: "after" }
    );
    const title = lesson?.title ?? "dars";
    await CoinLedger.create({
      studentId: submission.studentId,
      amount: delta,
      type: "homework",
      xp: delta,
      referenceId: submission._id,
      description:
        delta > 0
          ? `Uyga vazifa uchun${auto ? " (AI bahosi)" : ""}: ${title} (${p.score} ball)`
          : `Uyga vazifa bahosi o'zgartirildi: ${title} (${p.score} ball)`,
      balanceAfter: student?.totalCoins ?? 0,
    });
    if (delta > 0) await syncLevel(submission.studentId);
  }

  if (p.gradedBy) {
    await AuditLog.create({
      actorId: p.gradedBy,
      targetUserId: submission.studentId,
      action: "GRADE_HOMEWORK",
      details: { submissionId: submission._id, lessonId: submission.lessonId, score: p.score, coins: p.coins, coinsDelta: delta },
    });
  }

  notify(submission.studentId, "homework_graded", {
    lessonId: submission.lessonId.toString(),
    lessonTitle: lesson?.title ?? "Dars",
    score: p.score,
    coins: p.coins,
    feedback: p.feedback,
  });
  return { ok: true, lessonId: submission.lessonId.toString() };
}
