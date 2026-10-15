import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ getDownloadPresignedUrl: async () => "https://files.test/x" }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn() }));
vi.mock("@/lib/notifications/scheduled", () => ({ notifyFinishedExams: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Exam } = await import("@/lib/db/models/exam.model");
const { ExamSubmission } = await import("@/lib/db/models/exam-submission.model");
const exams = await import("@/actions/exam.actions");

async function seed(maxAttempts: number) {
  const group = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027" });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const student = await User.create({ login: "ali", fullName: "Ali", role: "student", groupId: group._id, passwordHash: "x" });
  const exam = await Exam.create({
    groupIds: [group._id],
    quarter: 1,
    title: "Chorak imtihoni",
    startTime: new Date(Date.now() - 60 * 60 * 1000),
    endTime: new Date(Date.now() + 60 * 60 * 1000),
    durationMinutes: 30,
    maxAttempts,
    passingScore: 50,
    isPublished: true,
    isResultsPublished: true,
    questions: [{ type: "single_choice", prompt: "2 + 2?", options: ["3", "4"], correctAnswers: ["4"], points: 10 }],
  });
  const examId = exam._id.toString();
  const questionId = exam.questions[0]._id!.toString();
  const answer = (value: string) => ({ examId, answers: [{ questionId, type: "single_choice", value }] });
  return { mentor, student, examId, answer };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("imtihon: bir necha urinish", () => {
  it("2 ta urinish berilgan bo'lsa ikkinchi marta ishlash mumkin, ikkala natija saqlanadi, oxirgisi asosiy", async () => {
    const { mentor, student, examId, answer } = await seed(2);
    actAs(sessionFor(student));

    expect((await exams.startExamAttemptAction(examId)).success).toBe(true);
    expect((await exams.submitExamAction(answer("4"))).success).toBe(true);

    // Ro'yxatda ham, imtihon sahifasida ham qayta ishlash taklif qilinadi
    const list = await exams.getExamsForStudent();
    expect(list.data?.active[0].canRetake).toBe(true);
    expect((await exams.getExamForStudent(examId)).data?.canRetake).toBe(true);

    expect((await exams.startExamAttemptAction(examId)).success).toBe(true);
    expect((await exams.submitExamAction(answer("3"))).success).toBe(true);

    const saved = await ExamSubmission.find({ examId }).sort({ attemptNumber: 1 }).lean();
    expect(saved.map((s) => [s.attemptNumber, s.totalScore])).toEqual([
      [1, 10],
      [2, 0],
    ]);

    // O'quvchiga asosiy natija — oxirgi urinish, lekin ikkalasi ham ko'rinadi
    const result = await exams.getExamResultForStudent(examId);
    expect(result.data?.submission.attemptNumber).toBe(2);
    expect(result.data?.attempts.map((a) => [a.attemptNumber, a.isMain])).toEqual([
      [2, true],
      [1, false],
    ]);

    // Urinishlar tugadi
    expect((await exams.getExamsForStudent()).data?.active[0].canRetake).toBe(false);
    expect((await exams.startExamAttemptAction(examId)).success).toBe(false);

    actAs(sessionFor(mentor));
    const rows = (await exams.getExamSubmissionsForMentor(examId)).data ?? [];
    expect(rows.map((r) => [r.attemptNumber, r.isMain])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect((await exams.getExamsForMentor()).data?.[0].submissionsCount).toBe(1);
  });

  it("1 ta urinish bo'lsa qayta ishlab bo'lmaydi", async () => {
    const { student, examId, answer } = await seed(1);
    actAs(sessionFor(student));
    await exams.startExamAttemptAction(examId);
    await exams.submitExamAction(answer("4"));
    expect((await exams.getExamsForStudent()).data?.active[0].canRetake).toBe(false);
    expect((await exams.startExamAttemptAction(examId)).success).toBe(false);
  });
});

describe("imtihon: to'liq ekran nazorati", () => {
  it("3-ogohlantirishda urinish yopiladi, 0 ball qo'yiladi va qayta urinib bo'lmaydi; mentor ochib beradi", async () => {
    const { mentor, student, examId, answer } = await seed(2);
    actAs(sessionFor(student));
    expect((await exams.startExamAttemptAction(examId)).success).toBe(true);

    const violate = (kind: string) => exams.recordExamViolationAction({ ...answer("4"), kind });
    expect((await violate("fullscreen_exit")).data).toEqual({ violations: 1, locked: false });
    expect((await violate("tab_hidden")).data).toEqual({ violations: 2, locked: false });
    expect((await violate("fullscreen_exit")).data).toEqual({ violations: 3, locked: true });

    // To'g'ri javob saqlangan bo'lsa ham ball 0; javoblar mentor ko'rishi uchun qoladi
    const locked = await ExamSubmission.findOne({ examId }).lean();
    expect(locked).toMatchObject({ status: "graded", totalScore: 0, maxScore: 10, isPassed: false, lockedForViolations: true });
    expect(locked?.answers[0]).toMatchObject({ value: "4", pointsAwarded: 0 });

    const page = await exams.getExamForStudent(examId);
    expect(page.data?.submission?.lockedForViolations).toBe(true);
    expect(page.data?.canRetake).toBe(false);
    expect((await exams.startExamAttemptAction(examId)).success).toBe(false);
    // Yopilgandan keyin yangi hodisa hech narsani o'zgartirmaydi
    expect((await violate("tab_hidden")).success).toBe(false);

    // O'quvchi o'zini ochib bera olmaydi
    expect((await exams.unlockExamSubmissionAction(locked!._id.toString())).success).toBe(false);

    actAs(sessionFor(mentor));
    expect((await exams.unlockExamSubmissionAction(locked!._id.toString())).success).toBe(true);
    const reopened = await ExamSubmission.findOne({ examId }).lean();
    expect(reopened).toMatchObject({ status: "in_progress", violations: 0, lockedForViolations: false });
    expect(reopened?.violationLog?.map((v) => v.kind)).toEqual(["fullscreen_exit", "tab_hidden", "fullscreen_exit", "unlocked"]);

    // O'quvchi o'sha urinishni davom ettirib topshiradi
    actAs(sessionFor(student));
    expect((await exams.submitExamAction(answer("4"))).success).toBe(true);
    expect((await ExamSubmission.findOne({ examId }).lean())?.totalScore).toBe(10);
  });

  it("noto'g'ri hodisa turi va faol urinishsiz hodisa rad etiladi", async () => {
    const { student, examId, answer } = await seed(1);
    actAs(sessionFor(student));
    expect((await exams.recordExamViolationAction({ ...answer("4"), kind: "fullscreen_exit" })).success).toBe(false);
    await exams.startExamAttemptAction(examId);
    expect((await exams.recordExamViolationAction({ ...answer("4"), kind: "unlocked" })).success).toBe(false);
    expect((await ExamSubmission.findOne({ examId }).lean())?.violations).toBe(0);
  });
});
