import { isAiConfigured } from "@/lib/ai/claude";
import { connectToDatabase } from "@/lib/db/connect";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { DEFAULT_HOMEWORK_COINS, suggestHomeworkCoins } from "@/lib/homework-status";
import { reviewSubmission } from "@/lib/homework-ai-review";
import { applyHomeworkGrade } from "@/lib/homework-grade";
import type { HomeworkReview } from "@/lib/ai/review-homework";

// Javob yuborilgach AI uni fonda tekshiradi va ishonchi yetarli bo'lsa — o'zi baholaydi (coin mentor
// formulasi bilan: ball × mukofot / 100, kechiksa 0). Shubhali holatlarda (AI ishonchi past, AI yozgan yoki
// ko'chirilgan bo'lishi mumkin, javobning ko'p qismini ko'ra olmagan) — baholamaydi, mentorga qoldiradi; mentor
// "AI bilan tekshirish"ni bossa natija keshdan darhol chiqadi. Mentor AI bahosini istalgan payt o'zgartira oladi.

/** Fondagi ish uchun AI kutish chegarasi */
const AUTO_DEADLINE_MS = 150_000;
/** Plagiat shu foizdan yuqori bo'lsa — mentorga */
const SIMILARITY_LIMIT = 60;

export type AutoGradeOutcome = "graded" | "left" | "failed" | "skipped";

/** Nega mentorga qoldirildi (bo'sh — avtomatik baholash mumkin) */
export function autoGradeBlockers(review: Pick<HomeworkReview, "confidence" | "originality" | "checks">, similarity: number): string[] {
  const reasons: string[] = [];
  if (review.confidence === "low") reasons.push("AI ishonchi past");
  if (review.originality.aiLikelihood === "high") reasons.push("AI yordamida yozilgan bo'lishi mumkin");
  if (review.originality.copyLikelihood === "high" || similarity >= SIMILARITY_LIMIT) reasons.push("boshqa javobga juda o'xshash");
  const unchecked = review.checks.filter((c) => c.verdict === "unchecked").length;
  if (review.checks.length > 0 && unchecked * 2 > review.checks.length) reasons.push("javobning ko'p qismini ko'ra olmadi");
  return reasons;
}

const AI_SIGNATURE = "\n\n— IT Xiva AI tekshiruvi. Savol bo'lsa, ustozingizga yozing.";

export async function autoGradeHomework(submissionId: string): Promise<AutoGradeOutcome> {
  if (!isAiConfigured()) return "skipped";
  await connectToDatabase();
  const sub = await HomeworkSubmission.findById(submissionId).select("status isLate integrity lessonId").lean();
  if (!sub || sub.status !== "submitted") return "skipped";
  const mark = (status: "pending" | "done" | "failed" | "skipped", note = "") =>
    HomeworkSubmission.updateOne({ _id: sub._id, status: "submitted" }, { $set: { aiGrade: { status, at: new Date(), note } } });
  await mark("pending");

  let outcome: Awaited<ReturnType<typeof reviewSubmission>>;
  try {
    outcome = await reviewSubmission(submissionId, { deadlineMs: AUTO_DEADLINE_MS });
  } catch (error) {
    await mark("failed", error instanceof Error ? error.message.slice(0, 300) : "AI ishlamadi");
    return "failed";
  }
  if (!outcome.ok) {
    await mark("skipped", outcome.message);
    return "skipped";
  }
  const review = outcome.review;
  const reasons = autoGradeBlockers(review, sub.integrity?.similarity ?? 0);
  if (reasons.length > 0) {
    await mark("done", `Mentorga qoldirildi: ${reasons.join(", ")}. AI taklifi: ${review.score} ball`);
    return "left";
  }
  const lesson = await Lesson.findById(sub.lessonId).select("homework").lean();
  const coins = suggestHomeworkCoins(review.score, lesson?.homework?.coinsReward ?? DEFAULT_HOMEWORK_COINS, Boolean(sub.isLate));
  const r = await applyHomeworkGrade({
    submissionId,
    score: review.score,
    feedback: `${review.feedback.slice(0, 3000 - AI_SIGNATURE.length)}${AI_SIGNATURE}`,
    coins,
    gradedBy: null,
    onlyIf: "submitted",
  });
  if (!r.ok) return "skipped";
  await HomeworkSubmission.updateOne({ _id: sub._id }, { $set: { aiGrade: { status: "done", at: new Date(), note: `AI baholadi: ${review.score} ball, ${coins} coin` } } });
  return "graded";
}
