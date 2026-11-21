"use server";

import { seededShuffle } from "@/lib/quiz-quality";
import { MIN_HUMAN_ANSWER_MS } from "@/lib/anti-cheat/kinds";
import { recordCheats } from "@/lib/anti-cheat/record";
import mongoose from "mongoose";
import { unstable_rethrow } from "next/navigation";
import { connectDB } from "@/lib/db/connect";
import { Quiz, type IQuiz, type IQuizQuestion, type QuizQuestionType } from "@/lib/db/models/quiz.model";
import { QuizSubmission } from "@/lib/db/models/quiz-submission.model";
import { QuizRun, type IQuizRun, type IQuizRunAnswer } from "@/lib/db/models/quiz-run.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { User } from "@/lib/db/models/user.model";
import { requireGroupAccess, requireStudent } from "@/lib/auth/guards";
import { autoGradeQuiz } from "@/lib/grading";
import { finalizeQuizAnswers } from "@/lib/quiz-finalize";
import {
  QUIZ_LEADERBOARD_DAYS,
  QUIZ_PLACE_COINS,
  QUIZ_TIME_GRACE_MS,
  answerPoints,
  questionTimeLimit,
} from "@/lib/quiz-game";

// Test o'yini: savollar birma-bir, vaqt va ochko serverda hisoblanadi (to'g'ri javob oldindan yuborilmaydi).

type Result<T> = { success: true; data: T } | { success: false; error: string };

export interface GameQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  points: number;
  timeLimit: number;
  index: number;
  total: number;
  /** Qolgan vaqt (ms): sahifa yangilansa vaqt qaytadan boshlanmaydi */
  remainingMs: number;
  /** Qayta ishlash (mashq): coin berilmaydi */
  practice: boolean;
}

export interface GameProgress {
  runId: string;
  index: number;
  total: number;
  score: number;
  streak: number;
  /** Qayta ishlash (mashq): coin berilmaydi, natija va reyting o'zgarmaydi */
  practice: boolean;
}

export interface GameFeedback {
  /** null — ochiq savol, keyin tekshiriladi */
  isCorrect: boolean | null;
  timedOut: boolean;
  correctAnswers: string[];
  explanation?: string;
  base: number;
  bonus: number;
  gamePoints: number;
  streak: number;
  score: number;
  finished: boolean;
  practice: boolean;
  /** O'yin tugaganda: test bali */
  final?: { totalScore: number; maxScore: number; status: string; correct: number; total: number; maxStreak: number };
}

function fail(error: string): { success: false; error: string } {
  return { success: false, error };
}

/** Test, dars va ruxsat: o'quvchi faqat o'z guruhining nashr etilgan darsi testini o'ynaydi */
async function loadQuiz(quizId: unknown): Promise<{ quiz: IQuiz; lessonId: mongoose.Types.ObjectId; lessonDate: Date } | null> {
  if (typeof quizId !== "string" || !mongoose.isValidObjectId(quizId)) return null;
  const quiz = await Quiz.findById(quizId);
  if (!quiz || !quiz.isPublished) return null;
  const lesson = await Lesson.findById(quiz.lessonId).select("groupId isPublished date createdAt").lean();
  if (!lesson || !lesson.isPublished) return null;
  await requireGroupAccess(lesson.groupId.toString());
  return { quiz, lessonId: lesson._id, lessonDate: new Date(lesson.date ?? lesson.createdAt ?? Date.now()) };
}

async function loadRun(runId: unknown, studentId: string): Promise<IQuizRun | null> {
  if (typeof runId !== "string" || !mongoose.isValidObjectId(runId)) return null;
  return QuizRun.findOne({ _id: runId, studentId, finishedAt: null });
}

const progressOf = (run: IQuizRun): GameProgress => ({
  runId: run._id.toString(),
  index: run.index,
  total: run.questionIds.length,
  score: run.score,
  streak: run.streak,
  practice: Boolean(run.practice),
});

/**
 * O'yinni boshlaydi yoki tugallanmaganini davom ettiradi. Faqat hali javob berilmagan savollar o'ynaladi
 * (topshirilgandan keyin mentor qo'shgan savollar — alohida raund). Hammasiga javob berilgan bo'lsa —
 * qayta ishlash (mashq): barcha savollar, lekin natija saqlanmaydi va coin berilmaydi.
 */
export async function startQuizGameAction(quizId: string): Promise<Result<GameProgress>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const loaded = await loadQuiz(quizId);
    if (!loaded) return fail("Test topilmadi yoki faol emas");
    const { quiz, lessonId } = loaded;

    const active = await QuizRun.findOne({ quizId: quiz._id, studentId: user.userId, finishedAt: null });
    if (active) return { success: true, data: progressOf(active) };

    const submission = await QuizSubmission.findOne({ quizId: quiz._id, studentId: user.userId }).select("answers.questionId").lean();
    const answered = new Set((submission?.answers ?? []).map((a) => a.questionId));
    const allIds = quiz.questions.map((q) => String(q._id));
    let questionIds = allIds.filter((id) => !answered.has(id));
    const practice = questionIds.length === 0;
    if (practice) questionIds = allIds;
    if (questionIds.length === 0) return fail("Testda savol yo'q");

    await QuizRun.init();
    try {
      const run = await QuizRun.create({ quizId: quiz._id, lessonId, studentId: user.userId, questionIds, practice });
      return { success: true, data: progressOf(run) };
    } catch (error) {
      // Ikki marta bosilgan: birinchi yaratilgani davom etadi
      if ((error as { code?: number })?.code !== 11000) throw error;
      const again = await QuizRun.findOne({ quizId: quiz._id, studentId: user.userId, finishedAt: null });
      if (!again) throw error;
      return { success: true, data: progressOf(again) };
    }
  } catch (err) {
    unstable_rethrow(err);
    return fail(err instanceof Error ? err.message : "O'yinni boshlab bo'lmadi");
  }
}

/** Joriy savol (to'g'ri javobsiz). Birinchi so'ralganda vaqt shu paytdan boshlanadi */
export async function nextQuizQuestionAction(runId: string): Promise<Result<GameQuestion>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const run = await loadRun(runId, user.userId);
    if (!run) return fail("O'yin topilmadi");
    const quiz = await Quiz.findById(run.quizId).lean();
    if (!quiz || !quiz.isPublished) return fail("Test topilmadi yoki faol emas");

    const question = quiz.questions.find((q) => String(q._id) === run.questionIds[run.index]);
    if (!question) return fail("Savol topilmadi — testni qayta oching");

    const limit = questionTimeLimit(question);
    let servedAt = run.servedAt ? new Date(run.servedAt) : null;
    if (!servedAt) {
      servedAt = new Date();
      // Shartli: parallel so'rov vaqtni qayta boshlab yubormasin
      const set = await QuizRun.updateOne({ _id: run._id, index: run.index, servedAt: null }, { $set: { servedAt } });
      if (set.modifiedCount === 0) {
        const fresh = await QuizRun.findById(run._id).select("servedAt").lean();
        servedAt = fresh?.servedAt ? new Date(fresh.servedAt) : servedAt;
      }
    }
    const remainingMs = Math.max(0, limit * 1000 - (Date.now() - servedAt.getTime()));
    return {
      success: true,
      data: {
        id: String(question._id),
        type: question.type,
        prompt: question.prompt,
        // Variantlar har o'quvchiga o'z tartibida (to'g'ri javob doim bir joyda turmasin)
        options: seededShuffle(question.options ?? [], `${user.userId}:${String(question._id)}`),
        points: question.points,
        timeLimit: limit,
        index: run.index,
        total: run.questionIds.length,
        remainingMs,
        practice: Boolean(run.practice),
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    return fail(err instanceof Error ? err.message : "Savolni olib bo'lmadi");
  }
}

function cleanValue(value: unknown): string | string[] {
  if (typeof value === "string") return value.slice(0, 10000);
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").slice(0, 50).map((v) => v.slice(0, 1000));
  return "";
}

/** Joriy savolga javob: vaqt serverda o'lchanadi, javob darhol baholanadi */
export async function answerQuizQuestionAction(runId: string, questionId: string, value: unknown): Promise<Result<GameFeedback>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const run = await loadRun(runId, user.userId);
    if (!run) return fail("O'yin topilmadi");
    if (run.questionIds[run.index] !== questionId || !run.servedAt) return fail("Bu savolga hozir javob berib bo'lmaydi");

    const quiz = await Quiz.findById(run.quizId).lean();
    if (!quiz || !quiz.isPublished) return fail("Test topilmadi yoki faol emas");
    const question = quiz.questions.find((q) => String(q._id) === questionId);
    if (!question) return fail("Savol topilmadi — testni qayta oching");

    const limit = questionTimeLimit(question);
    const elapsed = Date.now() - new Date(run.servedAt).getTime();
    const timedOut = elapsed > limit * 1000 + QUIZ_TIME_GRACE_MS;
    const graded = autoGradeQuiz({ questions: [question], submittedAnswers: [{ questionId, value: timedOut ? "" : cleanValue(value) }] });
    const answer = graded.answers[0];
    if (timedOut) {
      answer.isCorrect = question.type === "open_ended" ? false : answer.isCorrect;
      answer.pointsAwarded = 0;
    }

    // Ochiq savol o'yin ochkosi bermaydi va ketma-ketlikni buzmaydi
    const isOpen = question.type === "open_ended";
    const isCorrect = Boolean(answer.isCorrect);
    const streak = isOpen ? run.streak : isCorrect ? run.streak + 1 : 0;
    // Anti-cheat: inson ulgurmaydigan tezlikdagi javob — tezlik bonusi yo'q, mentorga qayd etiladi
    const tooFast = !isOpen && elapsed < MIN_HUMAN_ANSWER_MS;
    if (tooFast) void recordCheats(user.userId, "quiz", String(run.quizId), { fast: 1 }).catch(() => {});
    const pts = isOpen ? { base: 0, bonus: 0, total: 0 } : answerPoints({ isCorrect, elapsedMs: tooFast ? limit * 1000 : elapsed, limitSec: limit, streak });
    const runAnswer: IQuizRunAnswer = {
      ...answer,
      ms: Math.min(elapsed, limit * 1000),
      timedOut,
      gamePoints: pts.total,
    };

    const last = run.index + 1 >= run.questionIds.length;
    // Shartli: bitta savolga ikki marta javob yozilmaydi
    const updated = await QuizRun.findOneAndUpdate(
      { _id: run._id, index: run.index, finishedAt: null },
      {
        $push: { answers: runAnswer },
        $inc: { index: 1, score: pts.total },
        $set: { servedAt: null, streak, ...(last ? { finishedAt: new Date() } : {}) },
        $max: { maxStreak: streak },
      },
      { returnDocument: "after" }
    );
    if (!updated) return fail("Bu savolga allaqachon javob berilgan");

    const feedback: GameFeedback = {
      isCorrect: isOpen && answer.isCorrect === undefined ? null : isCorrect,
      timedOut,
      correctAnswers: question.correctAnswers ?? [],
      explanation: question.explanation,
      base: pts.base,
      bonus: pts.bonus,
      gamePoints: pts.total,
      streak,
      score: updated.score,
      finished: last,
      practice: Boolean(updated.practice),
    };

    if (last) {
      const final = updated.practice
        ? practiceResult(updated, quiz.questions as IQuizQuestion[])
        : await finalizeRun(updated, quiz.questions as IQuizQuestion[], user.userId);
      if (final) feedback.final = final;
    }
    return { success: true, data: feedback };
  } catch (err) {
    unstable_rethrow(err);
    return fail(err instanceof Error ? err.message : "Javobni yuborib bo'lmadi");
  }
}

/** Qayta ishlash tugadi: faqat natija hisoblanadi — hech narsa yozilmaydi, coin berilmaydi */
function practiceResult(run: IQuizRun, allQuestions: IQuizQuestion[]) {
  const byId = new Map(allQuestions.map((q) => [String(q._id), q]));
  const questions = run.questionIds.map((id) => byId.get(id)).filter((q): q is IQuizQuestion => Boolean(q));
  const answers = run.answers.filter((a) => byId.has(a.questionId));
  const pendingOpen = answers.some((a) => byId.get(a.questionId)?.type === "open_ended" && a.isCorrect === undefined);
  return {
    totalScore: answers.reduce((s, a) => s + (a.pointsAwarded ?? 0), 0),
    maxScore: questions.reduce((s, q) => s + q.points, 0),
    status: pendingOpen ? "submitted" : "graded",
    correct: answers.filter((a) => a.isCorrect === true && byId.get(a.questionId)?.type !== "open_ended").length,
    total: questions.length,
    maxStreak: run.maxStreak,
  };
}

/** O'yin tugadi: javoblar oddiy test topshirig'i sifatida yoziladi (coin, AI tekshiruv — o'sha yo'l bilan) */
async function finalizeRun(run: IQuizRun, allQuestions: IQuizQuestion[], studentId: string) {
  const byId = new Map(allQuestions.map((q) => [String(q._id), q]));
  const questions = run.questionIds.map((id) => byId.get(id)).filter((q): q is IQuizQuestion => Boolean(q));
  const answers = run.answers
    .filter((a) => byId.has(a.questionId))
    .map((a) => ({ questionId: a.questionId, value: a.value, isCorrect: a.isCorrect, pointsAwarded: a.pointsAwarded }));
  const totalScore = answers.reduce((s, a) => s + (a.pointsAwarded ?? 0), 0);
  const maxScore = questions.reduce((s, q) => s + q.points, 0);
  const hasOpenEnded = run.answers.some((a) => byId.get(a.questionId)?.type === "open_ended" && a.isCorrect === undefined);

  const correctOnes = run.answers.filter((a) => a.isCorrect === true && byId.get(a.questionId)?.type !== "open_ended");
  const game = {
    score: run.score,
    correct: correctOnes.length,
    total: questions.length,
    avgMs: correctOnes.length > 0 ? Math.round(correctOnes.reduce((s, a) => s + a.ms, 0) / correctOnes.length) : 0,
    maxStreak: run.maxStreak,
  };
  const result = await finalizeQuizAnswers({
    quizId: run.quizId,
    lessonId: run.lessonId,
    studentId,
    questions,
    graded: { answers, totalScore, maxScore, hasOpenEnded },
    game,
  });
  if (!result) return null;
  return {
    totalScore: result.totalScore,
    maxScore: result.maxScore,
    status: result.status,
    correct: game.correct,
    total: game.total,
    maxStreak: game.maxStreak,
  };
}

export interface LeaderboardRow {
  rank: number | null;
  name: string;
  score: number | null;
  correct: number | null;
  total: number | null;
  isMe: boolean;
}

export interface QuizLeaderboard {
  rows: LeaderboardRow[];
  myRank: number | null;
  players: number;
  /** Reyting yakunlanadigan vaqt (1–3 o'ringa bonus shunda beriladi) */
  endsAt: string;
  ended: boolean;
  prizes: number[];
  /** Tugallanmagan o'yin bo'lsa — davom ettirish uchun */
  activeRun: { index: number; total: number; score: number; practice: boolean } | null;
  /** Ovoz, titrash va konfetti (o'quvchi profilda o'chirib qo'yishi mumkin) */
  effects: boolean;
}

/** O'z guruhi bo'yicha test reytingi: ochko, teng bo'lsa — kim oldin tugatgan */
export async function getQuizLeaderboardAction(quizId: string): Promise<Result<QuizLeaderboard>> {
  try {
    const user = await requireStudent();
    await connectDB();
    const loaded = await loadQuiz(quizId);
    if (!loaded) return fail("Test topilmadi yoki faol emas");
    const { quiz, lessonDate } = loaded;

    const [subs, groupStudents, active, me] = await Promise.all([
      QuizSubmission.find({ quizId: quiz._id }).select("studentId game").lean(),
      User.find({ role: "student", groupId: user.groupId }).select("_id fullName").lean(),
      QuizRun.findOne({ quizId: quiz._id, studentId: user.userId, finishedAt: null }).select("index questionIds score practice").lean(),
      User.findById(user.userId).select("celebrationsEnabled").lean(),
    ]);
    const names = new Map(groupStudents.map((s) => [s._id.toString(), s.fullName]));
    const mine = subs.filter((s) => names.has(s.studentId.toString()));
    const played = mine
      .filter((s) => s.game)
      .sort((a, b) => b.game!.score - a.game!.score || new Date(a.game!.finishedAt).getTime() - new Date(b.game!.finishedAt).getTime());
    const legacy = mine.filter((s) => !s.game);

    const rows: LeaderboardRow[] = [
      ...played.map((s, i) => ({
        rank: i + 1,
        name: names.get(s.studentId.toString()) ?? "O'quvchi",
        score: s.game!.score,
        correct: s.game!.correct,
        total: s.game!.total,
        isMe: s.studentId.toString() === user.userId,
      })),
      ...legacy.map((s) => ({
        rank: null,
        name: names.get(s.studentId.toString()) ?? "O'quvchi",
        score: null,
        correct: null,
        total: null,
        isMe: s.studentId.toString() === user.userId,
      })),
    ];
    const myRank = rows.find((r) => r.isMe)?.rank ?? null;
    const endsAt = new Date(lessonDate.getTime() + QUIZ_LEADERBOARD_DAYS * 86_400_000);
    // Top 10 va o'zi (pastda bo'lsa ham)
    const visible = rows.filter((r, i) => i < 10 || r.isMe);

    return {
      success: true,
      data: {
        rows: visible,
        myRank,
        players: played.length,
        endsAt: endsAt.toISOString(),
        ended: Date.now() >= endsAt.getTime(),
        prizes: QUIZ_PLACE_COINS,
        activeRun: active
          ? { index: active.index, total: active.questionIds.length, score: active.score, practice: Boolean(active.practice) }
          : null,
        effects: me?.celebrationsEnabled !== false,
      },
    };
  } catch (err) {
    unstable_rethrow(err);
    return fail(err instanceof Error ? err.message : "Reytingni olib bo'lmadi");
  }
}
