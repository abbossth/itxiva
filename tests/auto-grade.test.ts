import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Javob qaytarilgandan keyingi ish testda shu zahoti bajariladi
const afterJobs: Array<Promise<unknown>> = [];
vi.mock("next/server", () => ({ after: (job: () => unknown) => void afterJobs.push(Promise.resolve(job())) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ getDownloadPresignedUrl: async () => "https://files.test/x" }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));
vi.mock("@/lib/notifications/scheduled", () => ({ notifyFinishedExams: vi.fn(async () => {}) }));

type Item = { id: string; maxPoints: number; answer: string };
const aiGrader = vi.fn(async (items: Item[]) => new Map(items.map((i) => [i.id, { points: Math.ceil(i.maxPoints / 2), feedback: "Qisman to'g'ri" }])));
vi.mock("@/lib/ai/grade-open", () => ({ gradeOpenAnswersWithAi: (items: Item[]) => aiGrader(items) }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { QuizSubmission } = await import("@/lib/db/models/quiz-submission.model");
const { Exam } = await import("@/lib/db/models/exam.model");
const { ExamSubmission } = await import("@/lib/db/models/exam-submission.model");
const quizzes = await import("@/actions/quiz.actions");
const exams = await import("@/actions/exam.actions");

type OpenQuestion = { grading?: "auto" | "manual"; correctAnswers?: string[] };

async function seedQuiz(open: OpenQuestion[]) {
  const group = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027" });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const student = await User.create({ login: "ali", fullName: "Ali", role: "student", groupId: group._id, passwordHash: "x" });
  const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "HTML", isPublished: true });
  const quiz = await Quiz.create({
    lessonId: lesson._id,
    title: "Test",
    isPublished: true,
    questions: [
      { type: "single_choice", prompt: "2 + 2?", options: ["3", "4"], correctAnswers: ["4"], points: 2 },
      ...open.map((q, i) => ({ type: "open_ended" as const, prompt: `Ochiq savol ${i + 1}`, points: 10, correctAnswers: q.correctAnswers ?? [], grading: q.grading })),
    ],
  });
  const ids = quiz.questions.map((q) => q._id!.toString());
  const submit = async (openAnswers: string[]) => {
    actAs(sessionFor(student));
    const res = await quizzes.submitQuizAction({
      quizId: quiz._id.toString(),
      answers: [{ questionId: ids[0], value: "4" }, ...openAnswers.map((value, i) => ({ questionId: ids[i + 1], value }))],
    });
    await Promise.all(afterJobs.splice(0));
    return res;
  };
  const saved = () => QuizSubmission.findOne({ quizId: quiz._id }).lean();
  return { mentor, student, lesson, quiz, ids, submit, saved };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  aiGrader.mockClear();
  afterJobs.length = 0;
});

describe("ochiq savollarni avtomatik tekshirish", () => {
  it("namunaviy javobga mos kelsa AI'siz to'liq ball, bo'sh javobga 0", async () => {
    const { submit, saved } = await seedQuiz([{ correctAnswers: ["HyperText Markup Language"] }, {}]);
    const res = await submit(["  hypertext   markup language ", ""]);
    expect(res.data?.status).toBe("graded");
    expect(aiGrader).not.toHaveBeenCalled();
    const sub = await saved();
    expect(sub).toMatchObject({ status: "graded", totalScore: 12 });
    expect(sub!.answers.map((a) => a.pointsAwarded)).toEqual([2, 10, 0]);
  });

  it("boshqa javobni AI baholaydi va izoh qoldiradi", async () => {
    const { submit, saved } = await seedQuiz([{ correctAnswers: ["Namuna"] }]);
    const res = await submit(["O'z so'zlarim bilan yozilgan javob"]);
    expect(res.data?.status).toBe("submitted");
    expect(res.message).toContain("avtomatik");
    expect(aiGrader).toHaveBeenCalledTimes(1);
    const sub = await saved();
    expect(sub).toMatchObject({ status: "graded", totalScore: 7 });
    expect(sub!.answers[1]).toMatchObject({ pointsAwarded: 5, aiGraded: true, mentorFeedback: "Qisman to'g'ri", isCorrect: false });
  });

  it("\"mentor tekshiradi\" savoli AI'ga yuborilmaydi va mentorni kutadi", async () => {
    const { submit, saved, mentor, ids } = await seedQuiz([{ grading: "manual" }, {}]);
    await submit(["Mentorga javob", "AI'ga javob"]);
    expect(aiGrader).toHaveBeenCalledTimes(1);
    expect(aiGrader.mock.calls[0][0].map((i) => i.id)).toEqual([ids[2]]);
    let sub = await saved();
    expect(sub).toMatchObject({ status: "submitted", totalScore: 7 });
    expect(sub!.answers[1].aiGraded).toBeFalsy();

    // Mentor o'z savolini baholaydi va AI bahosini ham o'zgartira oladi
    actAs(sessionFor(mentor));
    expect((await quizzes.gradeQuizSubmissionAction({ submissionId: sub!._id.toString(), grades: [{ questionId: ids[1], pointsAwarded: 11 }] })).success).toBe(false);
    const graded = await quizzes.gradeQuizSubmissionAction({
      submissionId: sub!._id.toString(),
      grades: [
        { questionId: ids[1], pointsAwarded: 8 },
        { questionId: ids[2], pointsAwarded: 10, mentorFeedback: "Aslida to'g'ri" },
      ],
    });
    expect(graded.success).toBe(true);
    sub = await saved();
    expect(sub).toMatchObject({ status: "graded", totalScore: 20 });
    expect(sub!.answers[2]).toMatchObject({ aiGraded: false, mentorFeedback: "Aslida to'g'ri" });
  });

  it("AI ishlamasa javob mentorga qoladi; keyin qayta ishga tushirsa baholanadi", async () => {
    const { submit, saved, mentor, lesson } = await seedQuiz([{}]);
    aiGrader.mockRejectedValueOnce(new Error("AI band"));
    await submit(["Javob"]);
    expect(await saved()).toMatchObject({ status: "submitted", totalScore: 2 });

    actAs(sessionFor(mentor));
    const queue = await quizzes.getQuizReviewQueue(lesson._id.toString());
    expect(queue.data?.[0]).toMatchObject({ status: "submitted" });
    expect(queue.data?.[0].answers[0]).toMatchObject({ value: "Javob", auto: true, aiGraded: false });

    const retry = await quizzes.runQuizAiGradingAction(lesson._id.toString());
    expect(retry.data).toEqual({ checked: 1, graded: 1 });
    expect(await saved()).toMatchObject({ status: "graded", totalScore: 7 });
  });

  it("imtihon: ochiq savol AI bilan baholanadi, loyiha savoli bo'lsa mentor kutiladi", async () => {
    const group = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027" });
    const student = await User.create({ login: "ali", fullName: "Ali", role: "student", groupId: group._id, passwordHash: "x" });
    const make = (withProject: boolean) =>
      Exam.create({
        groupIds: [group._id],
        quarter: 1,
        title: withProject ? "Loyihali" : "Nazariy",
        startTime: new Date(Date.now() - 3600_000),
        endTime: new Date(Date.now() + 3600_000),
        durationMinutes: 30,
        maxAttempts: 1,
        passingScore: 50,
        isPublished: true,
        isResultsPublished: true,
        questions: [
          { type: "open_ended" as const, prompt: "API nima?", points: 10 },
          ...(withProject ? [{ type: "github_repo" as const, prompt: "Loyiha", points: 20 }] : []),
        ],
      });
    actAs(sessionFor(student));
    for (const withProject of [false, true]) {
      const exam = await make(withProject);
      const examId = exam._id.toString();
      await exams.startExamAttemptAction(examId);
      const res = await exams.submitExamAction({
        examId,
        answers: [{ questionId: exam.questions[0]._id!.toString(), type: "open_ended", value: "Dasturlar o'zaro gaplashadigan interfeys" }],
      });
      expect(res.success).toBe(true);
      await Promise.all(afterJobs.splice(0));
      const sub = await ExamSubmission.findOne({ examId }).lean();
      expect(sub!.answers[0]).toMatchObject({ pointsAwarded: 5, aiGraded: true });
      expect(sub).toMatchObject(withProject ? { status: "submitted", totalScore: 5, isPassed: false } : { status: "graded", totalScore: 5, isPassed: true });
    }
  });
});
