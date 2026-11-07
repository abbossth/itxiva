import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterJobs: Array<Promise<unknown>> = [];
vi.mock("next/server", () => ({ after: (job: () => unknown) => void afterJobs.push(Promise.resolve(job())) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));
vi.mock("@/lib/ai/grade-open", () => ({ gradeOpenAnswersWithAi: async () => new Map() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { QuizSubmission } = await import("@/lib/db/models/quiz-submission.model");
const { QuizRun } = await import("@/lib/db/models/quiz-run.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const game = await import("@/actions/quiz-game.actions");
const { answerPoints, questionTimeLimit } = await import("@/lib/quiz-game");
const { awardQuizPlaces } = await import("@/lib/quiz-places");

const T0 = new Date("2026-11-10T12:00:00+05:00");
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

async function seed() {
  const group = await Group.create({ name: "G-1", grade: 8 });
  const other = await Group.create({ name: "G-2", grade: 8 });
  const mk = (login: string, groupId = group._id) =>
    User.create({ login, fullName: login.toUpperCase(), role: "student", groupId, passwordHash: "x", totalCoins: 0, spendableBalance: 0 });
  const [ali, vali, guli, begona] = await Promise.all([mk("ali"), mk("vali"), mk("guli"), mk("begona", other._id)]);
  const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "HTML", isPublished: true, date: T0 });
  const quiz = await Quiz.create({
    lessonId: lesson._id,
    title: "HTML testi",
    isPublished: true,
    questions: [
      { type: "single_choice", prompt: "2 + 2?", options: ["3", "4"], correctAnswers: ["4"], points: 2, timeLimit: 10, explanation: "Oddiy" },
      { type: "multiple_choice", prompt: "Juft sonlar?", options: ["1", "2", "4"], correctAnswers: ["2", "4"], points: 3 },
      { type: "short_answer", prompt: "Poytaxt?", correctAnswers: ["Toshkent"], points: 1 },
    ],
  });
  const ids = quiz.questions.map((q) => q._id!.toString());
  return { group, ali, vali, guli, begona, lesson, quiz, ids, quizId: quiz._id.toString() };
}

/** O'quvchi o'yinni oxirigacha o'ynaydi: har savolga `ms` vaqtda `answers[i]` bilan */
async function play(student: Parameters<typeof sessionFor>[0], quizId: string, answers: unknown[], ms = 1000) {
  actAs(sessionFor(student));
  const start = await game.startQuizGameAction(quizId);
  if (!start.success) throw new Error(start.error);
  let last;
  for (const value of answers) {
    const q = await game.nextQuizQuestionAction(start.data.runId);
    if (!q.success) throw new Error(q.error);
    tick(ms);
    last = await game.answerQuizQuestionAction(start.data.runId, q.data.id, value);
    if (!last.success) throw new Error(last.error);
  }
  await Promise.all(afterJobs.splice(0));
  return last!;
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe("ochko formulasi", () => {
  it("tezlik 500–1000, ketma-ketlik bonusi ko'pi bilan +500, xato 0", () => {
    expect(answerPoints({ isCorrect: true, elapsedMs: 0, limitSec: 20, streak: 1 })).toEqual({ base: 1000, bonus: 0, total: 1000 });
    expect(answerPoints({ isCorrect: true, elapsedMs: 10_000, limitSec: 20, streak: 1 }).base).toBe(750);
    expect(answerPoints({ isCorrect: true, elapsedMs: 99_000, limitSec: 20, streak: 1 }).base).toBe(500);
    expect(answerPoints({ isCorrect: true, elapsedMs: 0, limitSec: 20, streak: 3 }).bonus).toBe(200);
    expect(answerPoints({ isCorrect: true, elapsedMs: 0, limitSec: 20, streak: 20 }).bonus).toBe(500);
    expect(answerPoints({ isCorrect: false, elapsedMs: 0, limitSec: 20, streak: 5 }).total).toBe(0);
  });

  it("vaqt: mentor tanlagani, aks holda 20 s (ochiq savolga 90 s)", () => {
    expect(questionTimeLimit({ type: "single_choice", timeLimit: 30 })).toBe(30);
    expect(questionTimeLimit({ type: "single_choice", timeLimit: 7 })).toBe(20);
    expect(questionTimeLimit({ type: "open_ended" })).toBe(90);
  });
});

describe("o'yin jarayoni", () => {
  it("savol to'g'ri javobsiz beriladi; javobdan keyin to'g'ri javob, ochko va streak", async () => {
    const { ali, quizId } = await seed();
    actAs(sessionFor(ali));
    const start = await game.startQuizGameAction(quizId);
    expect(start.success && start.data).toMatchObject({ index: 0, total: 3, score: 0 });
    const runId = start.success ? start.data.runId : "";

    const q1 = await game.nextQuizQuestionAction(runId);
    expect(q1.success && q1.data).toMatchObject({ prompt: "2 + 2?", timeLimit: 10, remainingMs: 10_000 });
    expect(JSON.stringify(q1)).not.toContain("correctAnswers");

    tick(2000);
    const a1 = await game.answerQuizQuestionAction(runId, q1.success ? q1.data.id : "", "4");
    expect(a1.success && a1.data).toMatchObject({ isCorrect: true, base: 900, bonus: 0, streak: 1, correctAnswers: ["4"], explanation: "Oddiy", finished: false });

    const q2 = await game.nextQuizQuestionAction(runId);
    tick(0);
    const a2 = await game.answerQuizQuestionAction(runId, q2.success ? q2.data.id : "", ["4", "2"]);
    expect(a2.success && a2.data).toMatchObject({ isCorrect: true, base: 1000, bonus: 100, streak: 2, score: 2000 });

    const q3 = await game.nextQuizQuestionAction(runId);
    const a3 = await game.answerQuizQuestionAction(runId, q3.success ? q3.data.id : "", "Samarqand");
    expect(a3.success && a3.data).toMatchObject({ isCorrect: false, gamePoints: 0, streak: 0, finished: true });
    expect(a3.success && a3.data.final).toMatchObject({ totalScore: 5, maxScore: 6, status: "graded", correct: 2, total: 3, maxStreak: 2 });

    const sub = await QuizSubmission.findOne({ studentId: ali._id }).lean();
    expect(sub?.game).toMatchObject({ score: 2000, correct: 2, total: 3, maxStreak: 2 });
    expect(sub?.answers).toHaveLength(3);
    expect(await QuizRun.countDocuments({ finishedAt: null })).toBe(0);
  });

  it("vaqt serverda o'lchanadi: kechikkan javob 'vaqt tugadi' — to'g'ri bo'lsa ham 0", async () => {
    const { ali, quizId } = await seed();
    actAs(sessionFor(ali));
    const { data } = (await game.startQuizGameAction(quizId)) as { data: { runId: string } };
    const q = await game.nextQuizQuestionAction(data.runId);
    tick(12_500); // 10 s + 2 s zaxiradan ko'p
    const a = await game.answerQuizQuestionAction(data.runId, q.success ? q.data.id : "", "4");
    expect(a.success && a.data).toMatchObject({ timedOut: true, isCorrect: false, gamePoints: 0 });
  });

  it("sahifa yangilansa vaqt qaytadan boshlanmaydi va o'yin davom etadi", async () => {
    const { ali, quizId } = await seed();
    actAs(sessionFor(ali));
    const first = (await game.startQuizGameAction(quizId)) as { data: { runId: string } };
    await game.nextQuizQuestionAction(first.data.runId);
    tick(4000);
    const again = await game.startQuizGameAction(quizId);
    expect(again.success && again.data.runId).toBe(first.data.runId);
    const q = await game.nextQuizQuestionAction(first.data.runId);
    expect(q.success && q.data.remainingMs).toBe(6000);
  });

  it("bir savolga ikki marta yoki boshqa savolga javob berib bo'lmaydi; begona o'yinga kirib bo'lmaydi", async () => {
    const { ali, vali, begona, quizId, ids } = await seed();
    actAs(sessionFor(ali));
    const { data } = (await game.startQuizGameAction(quizId)) as { data: { runId: string } };
    expect((await game.answerQuizQuestionAction(data.runId, ids[0], "4")).success).toBe(false); // savol hali berilmagan
    await game.nextQuizQuestionAction(data.runId);
    expect((await game.answerQuizQuestionAction(data.runId, ids[1], ["2"])).success).toBe(false);
    expect((await game.answerQuizQuestionAction(data.runId, ids[0], "4")).success).toBe(true);
    expect((await game.answerQuizQuestionAction(data.runId, ids[0], "4")).success).toBe(false);

    actAs(sessionFor(vali));
    expect((await game.nextQuizQuestionAction(data.runId)).success).toBe(false);
    actAs(sessionFor(begona));
    expect((await game.startQuizGameAction(quizId)).success).toBe(false);
  });

  it("tugatilgan test qayta o'ynalmaydi; mentor yangi savol qo'shsa — faqat yangisi o'ynaladi", async () => {
    const { ali, quiz, quizId } = await seed();
    await play(ali, quizId, ["4", ["2", "4"], "Toshkent"]);
    expect((await game.startQuizGameAction(quizId)).success).toBe(false);

    await Quiz.updateOne({ _id: quiz._id }, { $push: { questions: { type: "single_choice", prompt: "3 + 3?", options: ["6", "7"], correctAnswers: ["6"], points: 1 } } });
    const res = await play(ali, quizId, ["6"]);
    expect(res.success && res.data.final).toMatchObject({ totalScore: 7, maxScore: 7 });
    const sub = await QuizSubmission.findOne({ studentId: ali._id }).lean();
    expect(sub?.answers).toHaveLength(4);
    expect(sub?.game?.correct).toBe(4);
    expect(sub?.game?.total).toBe(4);
  });
});

describe("reyting va bonus", () => {
  it("o'z guruhi bo'yicha ochko tartibida; boshqa guruh ko'rinmaydi", async () => {
    const { ali, vali, guli, quizId } = await seed();
    await play(vali, quizId, ["4", ["2", "4"], "Toshkent"], 500);
    await play(ali, quizId, ["4", ["2"], "Toshkent"], 500);
    await QuizSubmission.create({ quizId, lessonId: (await Quiz.findById(quizId))!.lessonId, studentId: guli._id, answers: [], totalScore: 0, maxScore: 6, status: "graded" });

    actAs(sessionFor(ali));
    const lb = await game.getQuizLeaderboardAction(quizId);
    expect(lb.success && lb.data.rows.map((r) => [r.rank, r.name, r.isMe])).toEqual([
      [1, "VALI", false],
      [2, "ALI", true],
      [null, "GULI", false], // eski usulda topshirgan
    ]);
    expect(lb.success && lb.data.myRank).toBe(2);
  });

  it("1–3 o'ringa bonus dars sanasidan 7 kun o'tib, bir marta", async () => {
    const { ali, vali, guli, quizId } = await seed();
    await play(vali, quizId, ["4", ["2", "4"], "Toshkent"], 500);
    await play(ali, quizId, ["4", ["2", "4"], "Toshkent"], 3000);
    await play(guli, quizId, ["3", ["2"], "Toshkent"], 500);

    expect(await awardQuizPlaces(new Date(T0.getTime() + 6 * 86_400_000))).toEqual({ quizzes: 0, awarded: 0 });
    const later = new Date(T0.getTime() + 8 * 86_400_000);
    expect(await awardQuizPlaces(later)).toEqual({ quizzes: 1, awarded: 3 });
    expect(await awardQuizPlaces(later)).toEqual({ quizzes: 0, awarded: 0 });

    const bonus = async (id: import("mongoose").Types.ObjectId) =>
      (await CoinLedger.find({ studentId: id, idempotencyKey: /^quiz-place:/ }).lean()).map((l) => l.amount);
    expect(await bonus(vali._id)).toEqual([15]);
    expect(await bonus(ali._id)).toEqual([10]);
    expect(await bonus(guli._id)).toEqual([5]);
  });
});
