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
