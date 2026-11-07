import { connectToDatabase } from "@/lib/db/connect";
import { Quiz } from "@/lib/db/models/quiz.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { awardCoins } from "@/lib/gamification/award";
import { QUIZ_LEADERBOARD_DAYS, QUIZ_PLACE_COINS } from "@/lib/quiz-game";

// Test reytingi yakunlanganda (dars sanasidan 7 kun o'tib) guruhdagi 1–3 o'ringa bonus coin. Kunlik cron chaqiradi.

const DAY_MS = 86_400_000;
/** Juda eski darslar tekshirilmaydi */
const LOOKBACK_DAYS = 60;

export async function awardQuizPlaces(now: Date = new Date()): Promise<{ quizzes: number; awarded: number }> {
  await connectToDatabase();
  const endedBefore = new Date(now.getTime() - QUIZ_LEADERBOARD_DAYS * DAY_MS);
  const lessons = await Lesson.find({
    isPublished: true,
    date: { $lte: endedBefore, $gt: new Date(now.getTime() - (QUIZ_LEADERBOARD_DAYS + LOOKBACK_DAYS) * DAY_MS) },
  })
    .select("_id title")
    .lean();
  if (lessons.length === 0) return { quizzes: 0, awarded: 0 };
  const titleOf = new Map(lessons.map((l) => [l._id.toString(), l.title]));

  const quizzes = await Quiz.find({ lessonId: { $in: lessons.map((l) => l._id) }, isPublished: true, placesAwardedAt: null })
    .select("_id lessonId title")
    .lean();

  let awarded = 0;
  for (const quiz of quizzes) {
    // Shartli belgilash: parallel cron bonusni ikki marta bermaydi (coin kaliti ham himoya qiladi)
    const claimed = await Quiz.updateOne({ _id: quiz._id, placesAwardedAt: null }, { $set: { placesAwardedAt: now } });
    if (claimed.modifiedCount === 0) continue;

    const winners = await QuizSubmission.find({ quizId: quiz._id, "game.score": { $gt: 0 } })
      .select("studentId game")
      .sort({ "game.score": -1, "game.finishedAt": 1 })
      .limit(QUIZ_PLACE_COINS.length)
      .lean();
    for (const [i, w] of winners.entries()) {
      const place = i + 1;
      const res = await awardCoins({
        studentId: w.studentId,
        coin: QUIZ_PLACE_COINS[i],
        type: "quiz",
        description: `«${quiz.title}» testi reytingida ${place}-o'rin`,
        referenceId: quiz._id,
        idempotencyKey: `quiz-place:${quiz._id}:${w.studentId}`,
        notifyReason: `«${titleOf.get(quiz.lessonId.toString()) ?? quiz.title}» darsi testi reytingida ${place}-o'rin`,
      });
      if (res.ok && res.applied) awarded++;
    }
  }
  return { quizzes: quizzes.length, awarded };
}
