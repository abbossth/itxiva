import { connectToDatabase } from "@/lib/db/connect";
import { AiCache } from "@/lib/db/models/ai-cache.model";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { ExamSubmission } from "@/lib/db/models/exam-submission.model";
import { runIntegrityCheck } from "@/lib/homework-integrity";
import { aiGradeExamSubmission, aiGradeQuizSubmission, pendingAiAnswers } from "@/lib/auto-grade";
import { Quiz } from "@/lib/db/models/quiz.model";
import { Exam } from "@/lib/db/models/exam.model";
import { isAiConfigured } from "./claude";
import { autoGradeHomework } from "@/lib/homework-auto-grade";

// AI band yoki kunlik limiti tugagani uchun bajarilmay qolgan ishlarni keyinroq qayta bajaradi:
// vazifaning "AI yozganmi" tekshiruvi va test/imtihondagi ochiq javoblarning avtomatik bahosi.
// Mentor qo'lda "qayta tekshir" bosishi shart emas.

/** Doim ishlamaydigan ish limitni cheksiz yemasligi uchun: faqat oxirgi 3 kun va urinishlar orasida 6 soat */
const LOOKBACK_MS = 3 * 86_400_000;
const INTEGRITY_SPACING_MS = 6 * 3_600_000;
/** Avtomatik baholash qayta urinishlari orasida (yoki "pending"da osilib qolganda) — 30 daqiqa */
const AUTO_GRADE_SPACING_MS = 30 * 60 * 1000;
const LOCK_KEY = "lock:ai-retry";
/** Bir necha mentor bir vaqtda sahifa ochsa ham, qayta urinish soatiga bir marta */
const LOCK_MS = 60 * 60 * 1000;

export interface AiRetryResult {
  integrity: number;
  /** AI avtomatik baholagan uyga vazifalar */
  homework: number;
  quizzes: number;
  exams: number;
  skipped?: "locked" | "not_configured";
}

/** Bir soatlik qulf: olinmasa (boshqa jarayon yaqinda ishga tushirgan) — false */
async function acquireLock(): Promise<boolean> {
  try {
    await AiCache.updateOne(
      { key: LOCK_KEY, expiresAt: { $lte: new Date() } },
      { $set: { value: { at: Date.now() }, expiresAt: new Date(Date.now() + LOCK_MS) } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    // Qulf hali amalda: unique kalit tufayli yangi yozuv yaratilmaydi
    if ((error as { code?: number })?.code === 11000) return false;
    throw error;
  }
}

/**
 * Bajarilmay qolgan AI ishlarini ajratilgan vaqt ichida (eng eskisidan) qayta bajaradi.
 * Limit hali tugagan bo'lsa, har bir urinish tez qaytadi (model kutish vaqti bazada saqlanadi).
 */
export async function retryFailedAiWork({ budgetMs = 40_000, maxItems = 10, useLock = true } = {}): Promise<AiRetryResult> {
  const result: AiRetryResult = { integrity: 0, homework: 0, quizzes: 0, exams: 0 };
  if (!isAiConfigured()) return { ...result, skipped: "not_configured" };
  await connectToDatabase();
  if (useLock && !(await acquireLock())) return { ...result, skipped: "locked" };

  const deadline = Date.now() + budgetMs;
  const since = new Date(Date.now() - LOOKBACK_MS);
  let left = maxItems;
  const hasTime = () => left > 0 && Date.now() < deadline;

  const failedIntegrity = await HomeworkSubmission.find({
    "integrity.status": "failed",
    "integrity.checkedAt": { $lte: new Date(Date.now() - INTEGRITY_SPACING_MS) },
    submittedAt: { $gte: since },
  })
    .select("_id")
    .sort({ submittedAt: 1 })
    .limit(maxItems)
    .lean();
  for (const s of failedIntegrity) {
    if (!hasTime()) break;
    left--;
    await runIntegrityCheck(String(s._id));
    const after = await HomeworkSubmission.findById(s._id).select("integrity.status").lean();
    if (after?.integrity?.status === "done") result.integrity++;
  }

  // AI ishlamagani uchun avtomatik baholanmay qolgan uyga vazifalar (mentor hali baholamagan)
  const failedGrades = await HomeworkSubmission.find({
    status: "submitted",
    "aiGrade.status": { $in: ["failed", "pending"] },
    "aiGrade.at": { $lte: new Date(Date.now() - AUTO_GRADE_SPACING_MS) },
    submittedAt: { $gte: since },
  })
    .select("_id")
    .sort({ submittedAt: 1 })
    .limit(maxItems)
    .lean();
  for (const s of failedGrades) {
    if (!hasTime()) break;
    left--;
    if ((await autoGradeHomework(String(s._id)).catch(() => "failed")) === "graded") result.homework++;
  }

  // Ochiq javoblari hali baholanmagan ("submitted") topshiriqlar. Faqat AI kutayotgan javobi borlari olinadi:
  // mentor qo'lda baholaydigan savollar navbatni band qilmasin
  const [quizSubs, examSubs] = await Promise.all([
    QuizSubmission.find({ status: "submitted", submittedAt: { $gte: since } }).select("quizId answers").sort({ submittedAt: 1 }).limit(50).lean(),
    ExamSubmission.find({ status: "submitted", submittedAt: { $gte: since } }).select("examId answers").sort({ submittedAt: 1 }).limit(50).lean(),
  ]);
  const [quizDocs, examDocs] = await Promise.all([
    Quiz.find({ _id: { $in: quizSubs.map((q) => q.quizId) } }).select("questions").lean(),
    Exam.find({ _id: { $in: examSubs.map((e) => e.examId) } }).select("questions").lean(),
  ]);
  const quizQuestions = new Map(quizDocs.map((q) => [String(q._id), q.questions]));
  const examQuestions = new Map(examDocs.map((e) => [String(e._id), e.questions]));

  for (const q of quizSubs) {
    if (!hasTime()) break;
    if (pendingAiAnswers(quizQuestions.get(String(q.quizId)) ?? [], q.answers).length === 0) continue;
    left--;
    if (await aiGradeQuizSubmission(q._id).catch(() => false)) result.quizzes++;
  }
  for (const e of examSubs) {
    if (!hasTime()) break;
    if (pendingAiAnswers(examQuestions.get(String(e.examId)) ?? [], e.answers).length === 0) continue;
    left--;
    if (await aiGradeExamSubmission(e._id).catch(() => false)) result.exams++;
  }
  return result;
}
