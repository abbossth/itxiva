import mongoose from "mongoose";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Quiz } from "@/lib/db/models/quiz.model";
import type { ILiveQuestion, LiveGameSource, LiveQuestionType } from "@/lib/db/models/live-game.model";
import { addDaysToKey, dateFromKey, toDateKey } from "@/lib/schedule";
import { questionTimeLimit } from "@/lib/quiz-game";

// Jonli o'yin savollari: guruhning bugungi dars testidan yoki barcha dars testlaridan tasodifiy.
// Ochiq savollar olinmaydi — jonli o'yinda ularni darhol baholab bo'lmaydi. Bu fayl "use server" emas.

const LIVE_TYPES: LiveQuestionType[] = ["single_choice", "multiple_choice", "short_answer"];

export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Guruhning manbadagi testlari (bugungi — Toshkent sanasi bo'yicha) */
async function sourceQuizzes(groupId: mongoose.Types.ObjectId | string, source: LiveGameSource, now: Date) {
  const todayKey = toDateKey(now);
  const lessons = await Lesson.find({
    groupId,
    isPublished: true,
    ...(source === "today" ? { date: { $gte: dateFromKey(todayKey), $lt: dateFromKey(addDaysToKey(todayKey, 1)) } } : {}),
  })
    .select("_id")
    .lean();
  if (lessons.length === 0) return [];
  return Quiz.find({ lessonId: { $in: lessons.map((l) => l._id) }, isPublished: true }).select("questions").lean();
}

/** Manbada jonli o'yinga yaroqli savollar soni (yaratish oynasida ko'rsatiladi) */
export async function countLiveQuestions(groupId: mongoose.Types.ObjectId | string, source: LiveGameSource, now = new Date()): Promise<number> {
  const quizzes = await sourceQuizzes(groupId, source, now);
  return quizzes.reduce((n, q) => n + q.questions.filter((x) => LIVE_TYPES.includes(x.type as LiveQuestionType)).length, 0);
}

export async function pickQuestions(
  groupId: mongoose.Types.ObjectId | string,
  source: LiveGameSource,
  count: number,
  now = new Date()
): Promise<ILiveQuestion[]> {
  const quizzes = await sourceQuizzes(groupId, source, now);
  const pool: ILiveQuestion[] = [];
  const seen = new Set<string>();
  for (const quiz of quizzes) {
    for (const q of quiz.questions) {
      if (!LIVE_TYPES.includes(q.type as LiveQuestionType)) continue;
      // Bog'langan darslardagi bir xil savol ikki marta tushmasin
      const key = `${q.type}|${q.prompt.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pool.push({
        prompt: q.prompt,
        type: q.type as LiveQuestionType,
        options: q.type === "short_answer" ? [] : shuffle(q.options ?? []),
        correctAnswers: q.correctAnswers ?? [],
        timeLimit: questionTimeLimit(q),
        sourceQuizId: quiz._id,
        sourceQuestionId: q._id ? String(q._id) : null,
      });
    }
  }
  return shuffle(pool).slice(0, Math.max(1, count));
}
