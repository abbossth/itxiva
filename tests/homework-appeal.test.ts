import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
const notify = vi.fn();
const notifyMentors = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify, notifyMany: vi.fn(), notifyMentors, notifyGroup: vi.fn(), notifyAllStudents: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");
const hw = await import("@/actions/homework.actions");

async function seed() {
  const group = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027" });
  const mk = (login: string, role: "mentor" | "student", groupId: mongoose.Types.ObjectId | null = null) =>
    User.create({ login, fullName: login, role, groupId, passwordHash: "x", totalCoins: 0, spendableBalance: 0 });
  const mentor = await mk("mentor", "mentor");
  const student = await mk("ali", "student", group._id);
  const other = await mk("vali", "student", group._id);
  const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "HTML", isPublished: true, homework: { isEnabled: true, instructions: "x", attachments: [], dueAt: null, coinsReward: 20 } });
  const sub = await HomeworkSubmission.create({ lessonId: lesson._id, groupId: group._id, studentId: student._id, text: "javob", status: "graded", score: 60, coinsAwarded: 12, feedback: "o'rtacha" });
  return { mentor, student, other, lesson, sub, id: String(sub._id) };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  notify.mockClear();
  notifyMentors.mockClear();
});

describe("bahoga e'tiroz", () => {
  it("o'quvchi e'tiroz bildiradi → ustozlarga xabar, navbatda ko'rinadi; ikkinchisi ochiq turganda — yo'q", async () => {
    const { student, mentor, id } = await seed();
    actAs(sessionFor(student));
    expect(await hw.appealHomeworkAction({ submissionId: id, reason: "qisqa" })).toMatchObject({ success: false });
    expect((await hw.appealHomeworkAction({ submissionId: id, reason: "3-misol to'g'ri edi: 512 MB" })).success).toBe(true);
    expect(notifyMentors).toHaveBeenCalledWith("homework_submitted", expect.objectContaining({ appeal: { score: 60, reason: "3-misol to'g'ri edi: 512 MB" } }));
    expect(await hw.appealHomeworkAction({ submissionId: id, reason: "yana bir marta yozyapman" })).toMatchObject({ success: false, message: expect.stringContaining("allaqachon") });
    actAs(sessionFor(mentor));
    const inbox = await hw.getHomeworkInbox();
    expect(inbox.pending.find((r) => r.submissionId === id)).toMatchObject({ appealOpen: true, status: "graded" });
    expect(await hw.getHomeworkBadgeCount()).toBe(1);
  });

  it("ustoz qayta baholasa — e'tiroz 'accepted', coin farqi beriladi", async () => {
    const { student, mentor, id } = await seed();
    actAs(sessionFor(student));
    await hw.appealHomeworkAction({ submissionId: id, reason: "3-misol to'g'ri edi: 512 MB" });
    actAs(sessionFor(mentor));
    expect((await hw.gradeHomeworkAction({ submissionId: id, score: 90, coins: 18, feedback: "Ha, to'g'ri ekan" })).success).toBe(true);
    const s = await HomeworkSubmission.findById(id).lean();
    expect(s).toMatchObject({ score: 90, coinsAwarded: 18, appeal: { status: "accepted", answer: "Ha, to'g'ri ekan" }, appealCount: 1 });
    expect((await User.findById(student._id).lean())?.totalCoins).toBe(6);
  });

  it("rad etilsa — baho o'zgarmaydi, o'quvchiga sababi boradi; 2 tadan ortiq e'tiroz yo'q; begona o'quvchi yozolmaydi", async () => {
    const { student, other, mentor, id } = await seed();
    actAs(sessionFor(other));
    expect(await hw.appealHomeworkAction({ submissionId: id, reason: "bu meniki emas lekin" })).toMatchObject({ success: false });
    actAs(sessionFor(student));
    await hw.appealHomeworkAction({ submissionId: id, reason: "birinchi e'tirozim shu" });
    actAs(sessionFor(mentor));
    expect(await hw.rejectHomeworkAppealAction({ submissionId: id, answer: "1-misol xato" })).toMatchObject({ success: true });
    expect(notify).toHaveBeenCalledWith(expect.anything(), "homework_graded", expect.objectContaining({ appealRejected: true, score: 60, feedback: "1-misol xato" }));
    expect(await HomeworkSubmission.findById(id).lean()).toMatchObject({ score: 60, appeal: { status: "rejected" } });
    actAs(sessionFor(student));
    expect((await hw.appealHomeworkAction({ submissionId: id, reason: "ikkinchi e'tirozim shu" })).success).toBe(true);
    actAs(sessionFor(mentor));
    await hw.rejectHomeworkAppealAction({ submissionId: id, answer: "baribir xato" });
    actAs(sessionFor(student));
    expect(await hw.appealHomeworkAction({ submissionId: id, reason: "uchinchi e'tirozim shu" })).toMatchObject({ success: false, message: expect.stringContaining("2 marta") });
  });
});
