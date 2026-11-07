import mongoose from "mongoose";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { IQuizQuestion } from "@/lib/db/models/quiz.model";
import { QuizSubmission, type IQuizAnswer, type IQuizGameResult } from "@/lib/db/models/quiz-submission.model";
import { isAutoOpenQuestion } from "@/lib/grading";
import { aiGradeQuizSubmission, pendingAiAnswers } from "@/lib/auto-grade";
import { rewardQuizAnswers } from "@/lib/gamification/quiz-rewards";

// Test javoblarini yakunlash: QuizSubmission ga yozish, coin (gamifikatsiya) va ochiq javoblarni AI bilan tekshirish.
// Oddiy topshirish (submitQuizAction) ham, o'yin rejimi ham shu yerdan o'tadi. Bu fayl "use server" emas.

type Id = string | mongoose.Types.ObjectId;

export interface FinalizeResult {
  submissionId: string;
  answers: IQuizAnswer[];
  totalScore: number;
  maxScore: number;
  status: string;
  hasOpenEnded: boolean;
  needsMentor: boolean;
  aiPending: boolean;
}

/**
 * `graded` — shu safar javob berilgan savollar (autoGradeQuiz natijasi). Avval topshirilgan bo'lsa,
 * yangi savollar qo'shib yoziladi. Shu savollarga allaqachon javob yozilgan bo'lsa — null (ikki marta yozilmaydi).
 */
export async function finalizeQuizAnswers(params: {
  quizId: Id;
  lessonId: Id;
  studentId: string;
  questions: IQuizQuestion[];
  graded: { answers: IQuizAnswer[]; totalScore: number; maxScore: number; hasOpenEnded: boolean };
  /** O'yin rejimidan: reyting natijasi (avvalgi raund bilan qo'shiladi) */
  game?: Omit<IQuizGameResult, "finishedAt">;
}): Promise<FinalizeResult | null> {
  const { graded, questions } = params;
  const { hasOpenEnded } = graded;
  const existing = await QuizSubmission.findOne({ quizId: params.quizId, studentId: params.studentId }).lean();

  const mergedGame = (prev: IQuizGameResult | null | undefined): IQuizGameResult | undefined => {
    const g = params.game;
    if (!g) return prev ?? undefined;
    if (!prev) return { ...g, finishedAt: new Date() };
    const correct = prev.correct + g.correct;
    return {
      score: prev.score + g.score,
      correct,
      total: prev.total + g.total,
      avgMs: correct > 0 ? Math.round((prev.avgMs * prev.correct + g.avgMs * g.correct) / correct) : 0,
      maxStreak: Math.max(prev.maxStreak, g.maxStreak),
      finishedAt: new Date(),
    };
  };

  let submission: { _id: mongoose.Types.ObjectId; answers: IQuizAnswer[]; totalScore: number; maxScore: number; status: string };
  if (existing) {
    const game = mergedGame(existing.game);
    // Shartli yangilash: ikki marta yuborilsa ham yangi savollar bir marta qo'shiladi
    const updated = await QuizSubmission.findOneAndUpdate(
      { _id: existing._id, "answers.questionId": { $nin: questions.map((q) => String(q._id)) } },
      {
        $push: { answers: { $each: graded.answers } },
        $inc: { totalScore: graded.totalScore, maxScore: graded.maxScore },
        $set: { status: hasOpenEnded || existing.status === "submitted" ? "submitted" : "graded", ...(game ? { game } : {}) },
      },
      { returnDocument: "after" }
    ).lean();
    if (!updated) return null;
    submission = updated as typeof submission;
  } else {
    try {
      submission = await QuizSubmission.create({
        quizId: params.quizId,
        lessonId: params.lessonId,
        studentId: params.studentId,
        answers: graded.answers,
        totalScore: graded.totalScore,
        maxScore: graded.maxScore,
        status: hasOpenEnded ? "submitted" : "graded",
        submittedAt: new Date(),
        game: mergedGame(null) ?? null,
      });
    } catch (error) {
      // Parallel topshirish birinchi bo'lib yozgan
      if ((error as { code?: number })?.code === 11000) return null;
      throw error;
    }
  }

  // Gamifikatsiya: javob berilgan savollar kunlik topshiriqqa sanaladi, to'g'ri javoblar coin beradi (javobdan keyin)
  const answered = graded.answers
    .filter((a) => (Array.isArray(a.value) ? a.value.length > 0 : String(a.value ?? "").trim() !== ""))
    .map((a) => ({ questionId: a.questionId, isCorrect: a.isCorrect }));
  if (answered.length > 0) {
    const studentId = params.studentId;
    after(() => rewardQuizAnswers(studentId, answered).then(() => undefined).catch((error) => console.error("Quiz reward error:", error)));
  }

  // Ochiq javoblar javob qaytarilgandan keyin AI bilan tekshiriladi; mentor belgilagan savollar unga qoladi
  const aiPending = hasOpenEnded && pendingAiAnswers(questions, graded.answers).length > 0;
  const lessonId = String(params.lessonId);
  if (aiPending) {
    const submissionId = submission._id.toString();
    after(async () => {
      try {
        await aiGradeQuizSubmission(submissionId);
        revalidatePath(`/lessons/${lessonId}`);
      } catch (error) {
        console.error("Quiz AI grading error:", error);
      }
    });
  }
  const needsMentor = questions.some((q) => q.type === "open_ended" && !isAutoOpenQuestion(q));

  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath(`/mentor/lessons/${lessonId}`);

  return {
    submissionId: submission._id.toString(),
    answers: submission.answers.map((a) => ({
      questionId: a.questionId,
      value: a.value,
      isCorrect: a.isCorrect,
      pointsAwarded: a.pointsAwarded,
      mentorFeedback: a.mentorFeedback,
      aiGraded: a.aiGraded,
      correctAnswer: a.correctAnswer,
    })),
    totalScore: submission.totalScore,
    maxScore: submission.maxScore,
    status: submission.status,
    hasOpenEnded,
    needsMentor,
    aiPending,
  };
}
