import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";

// Ochiq javoblar bahosi keshi va bajarilmay qolgan AI ishlarini qayta bajarish

const generate = vi.fn(async ({ prompt }: { prompt: string }) => ({
  grades: [...prompt.matchAll(/id: (\S+)/g)].map((m) => ({ id: m[1], points: 1, feedback: "Yaxshi", correctAnswer: "Javob" })),
}));
vi.mock("@/lib/ai/claude", () => ({
  generateStructured: (p: { prompt: string }) => generate(p),
  isAiConfigured: () => true,
  AiError: class extends Error {},
}));
const estimate = vi.fn(async () => ({ score: 12, signals: ["oddiy"] }));
vi.mock("@/lib/ai/detect-ai", () => ({ estimateAiWriting: () => estimate() }));

const { gradeOpenAnswersWithAi } = await import("@/lib/ai/grade-open");
const { retryFailedAiWork } = await import("@/lib/ai/retry");
const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { QuizSubmission } = await import("@/lib/db/models/quiz-submission.model");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  generate.mockClear();
  estimate.mockClear();
});

const item = (id: string, answer: string) => ({ id, prompt: "HTML nima?", sample: "Belgilash tili", maxPoints: 2, answer });

describe("ochiq javoblar keshi", () => {
  it("bir xil javob qayta baholanmaydi; faqat yangilari AI'ga yuboriladi", async () => {
    const first = await gradeOpenAnswersWithAi([item("a", "Belgilash tili"), item("b", "Dasturlash tili")]);
    expect([...first.keys()].sort()).toEqual(["a", "b"]);
    expect(generate).toHaveBeenCalledTimes(1);

    // Boshqa o'quvchi: bitta javob bir xil (bo'shliqlar farqi bilan), bittasi yangi
    const second = await gradeOpenAnswersWithAi([item("c", "  Belgilash   tili "), item("d", "Bilmayman")]);
    expect(second.get("c")).toMatchObject({ points: 1 });
    expect(generate).toHaveBeenCalledTimes(2);
    const sentIds = [...(generate.mock.calls[1][0].prompt as string).matchAll(/id: (\S+)/g)].map((m) => m[1]);
    expect(sentIds).toEqual(["d"]);

    // Hammasi keshda — AI chaqirilmaydi
    await gradeOpenAnswersWithAi([item("e", "Bilmayman")]);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe("bajarilmay qolgan AI ishlari", () => {
  it("muvaffaqiyatsiz tekshiruv va AI kutayotgan test qayta bajariladi; qo'lda baholanadigan test tegilmaydi; soatiga bir marta", async () => {
    const group = await Group.create({ name: "8.2", grade: 8, academicYear: "2026-2027" });
    const student = await User.create({ login: "ali", fullName: "Ali", role: "student", groupId: group._id, passwordHash: "x" });
    const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "HTML", isPublished: true });
    const old = new Date(Date.now() - 7 * 3_600_000);
    const hw = await HomeworkSubmission.create({
      lessonId: lesson._id,
      groupId: group._id,
      studentId: student._id,
      text: "Uzun javob ".repeat(30),
      status: "submitted",
      submittedAt: old,
      integrity: { status: "failed", similarity: 0, matches: [], aiScore: null, aiSignals: [], checkedAt: old },
    });

    const quiz = await Quiz.create({
      lessonId: lesson._id,
      title: "Test",
      questions: [
        { type: "open_ended", prompt: "HTML nima?", points: 2, correctAnswers: ["Belgilash tili"] },
        { type: "open_ended", prompt: "O'zingiz yozing", points: 5, grading: "manual" },
      ],
    });
    const [autoQ, manualQ] = quiz.questions.map((q) => String(q._id));
    const aiWaiting = await QuizSubmission.create({
      quizId: quiz._id,
      lessonId: lesson._id,
      studentId: student._id,
      status: "submitted",
      submittedAt: old,
      answers: [{ questionId: autoQ, value: "Teglar bilan sahifa tuzish", pointsAwarded: 0 }],
    });
    const other = await User.create({ login: "vali", fullName: "Vali", role: "student", groupId: group._id, passwordHash: "x" });
    await QuizSubmission.create({
      quizId: quiz._id,
      lessonId: lesson._id,
      studentId: other._id,
      status: "submitted",
      submittedAt: old,
      answers: [{ questionId: manualQ, value: "Mentor o'qiydi", pointsAwarded: 0 }],
    });

    const res = await retryFailedAiWork();
    expect(res).toMatchObject({ integrity: 1 });
    expect(estimate).toHaveBeenCalledTimes(1);
    expect((await HomeworkSubmission.findById(hw._id).lean())?.integrity).toMatchObject({ status: "done", aiScore: 12 });
    // Faqat AI kutayotgan javob yuborildi (qo'lda baholanadigan savol emas)
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await QuizSubmission.findById(aiWaiting._id).lean())?.answers[0]).toMatchObject({ aiGraded: true, pointsAwarded: 1 });

    // Qulf: bir soat ichida qayta ishga tushmaydi
    expect(await retryFailedAiWork()).toMatchObject({ skipped: "locked" });
    expect(await retryFailedAiWork({ useLock: false })).toMatchObject({ integrity: 0 });
  });
});
