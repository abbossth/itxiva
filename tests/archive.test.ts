import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({
  sendNotifications: vi.fn(),
  notify: vi.fn(),
  notifyMany: vi.fn(),
  notifyMentors: vi.fn(),
  notifyGroup: vi.fn(),
  notifyAllStudents: vi.fn(),
}));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { StudentProfile } = await import("@/lib/db/models/student-profile.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");
const { AttendanceSession } = await import("@/lib/db/models/attendance-session.model");
const { AttendanceRecord } = await import("@/lib/db/models/attendance-record.model");
const { Archive, ArchivedDoc } = await import("@/lib/db/models/archive.model");
const students = await import("@/actions/student.actions");
const groups = await import("@/actions/group.actions");
const lessons = await import("@/actions/lesson.actions");
const attendance = await import("@/actions/attendance.actions");
const archive = await import("@/actions/archive.actions");

async function seed() {
  const group = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027", studentCount: 1 });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const student = await User.create({
    login: "ali",
    fullName: "Ali Valiyev",
    role: "student",
    groupId: group._id,
    passwordHash: "maxfiy-xesh",
    totalCoins: 25,
    spendableBalance: 25,
  });
  const lesson = await Lesson.create({
    groupId: group._id,
    quarter: 1,
    order: 1,
    title: "HTML",
    isPublished: true,
    homework: { isEnabled: true, instructions: "Sahifa", attachments: [], dueAt: null, coinsReward: 20 },
  });
  await StudentProfile.create({ studentId: student._id, notes: "izoh" });
  await CoinLedger.create({ studentId: student._id, amount: 20, type: "homework", description: "Vazifa", balanceAfter: 20 });
  await HomeworkSubmission.create({ lessonId: lesson._id, groupId: group._id, studentId: student._id, text: "javob", status: "graded", score: 90 });
  const session = await AttendanceSession.create({
    groupId: group._id,
    mentorId: mentor._id,
    status: "closed",
    currentCode: "ABC123",
    currentToken: "tok-1",
    finalizedAt: new Date(),
  });
  await AttendanceRecord.create({ sessionId: session._id, studentId: student._id, groupId: group._id, status: "present", coinsAwarded: 5, balanceDelta: 5 });
  actAs(sessionFor(mentor));
  return { group, mentor, student, lesson, session };
}

const onlyArchive = async () => (await archive.getArchiveItems())[0];

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("arxiv", () => {
  it("o'quvchi o'chirilganda hamma ma'lumoti arxivga ko'chadi va to'liq tiklanadi", async () => {
    const { student, group } = await seed();
    expect((await students.deleteStudentAction(student._id.toString())).success).toBe(true);

    // Asosiy to'plamlarda iz qolmaydi
    expect(await User.countDocuments({ _id: student._id })).toBe(0);
    for (const model of [StudentProfile, CoinLedger, HomeworkSubmission, AttendanceRecord]) {
      expect(await (model as typeof CoinLedger).countDocuments({ studentId: student._id })).toBe(0);
    }
    expect((await Group.findById(group._id))!.studentCount).toBe(0);

    const item = await onlyArchive();
    expect(item).toMatchObject({ kind: "student", title: "Ali Valiyev" });
    expect(item.subtitle).toContain("@ali");

    expect((await archive.restoreArchiveAction(item._id)).success).toBe(true);
    const restored = await User.findById(student._id).select("+passwordHash");
    expect(restored).toMatchObject({ login: "ali", totalCoins: 25, passwordHash: "maxfiy-xesh" });
    expect(await StudentProfile.countDocuments({ studentId: student._id })).toBe(1);
    expect(await CoinLedger.countDocuments({ studentId: student._id })).toBe(1);
    expect(await HomeworkSubmission.countDocuments({ studentId: student._id })).toBe(1);
    expect(await AttendanceRecord.countDocuments({ studentId: student._id })).toBe(1);
    expect((await Group.findById(group._id))!.studentCount).toBe(1);
    expect(await Archive.countDocuments()).toBe(0);
    expect(await ArchivedDoc.countDocuments()).toBe(0);
  });

  it("login band bo'lsa tiklangan o'quvchi yangi login oladi", async () => {
    const { student, group } = await seed();
    await students.deleteStudentAction(student._id.toString());
    await User.create({ login: "ali", fullName: "Boshqa Ali", role: "student", groupId: group._id, passwordHash: "x" });

    const res = await archive.restoreArchiveAction((await onlyArchive())._id);
    expect(res.success).toBe(true);
    expect(res.message).toContain("ali_2");
    expect((await User.findById(student._id))!.login).toBe("ali_2");
  });

  it("butunlay o'chirilgandan keyin tiklab bo'lmaydi", async () => {
    const { student } = await seed();
    await students.deleteStudentAction(student._id.toString());
    const item = await onlyArchive();
    expect((await archive.purgeArchiveAction(item._id)).success).toBe(true);
    expect(await Archive.countDocuments()).toBe(0);
    expect(await ArchivedDoc.countDocuments()).toBe(0);
    expect((await archive.restoreArchiveAction(item._id)).success).toBe(false);
    expect(await User.countDocuments({ _id: student._id })).toBe(0);
  });

  it("guruh arxivda bo'lsa o'quvchi tiklanmaydi; guruhni uning o'quvchilari arxivda turganda butunlay o'chirib bo'lmaydi", async () => {
    const { student, group } = await seed();
    await students.deleteStudentAction(student._id.toString());
    expect((await groups.deleteGroupAction(group._id.toString())).success).toBe(true);
    expect(await Group.countDocuments()).toBe(0);

    const items = await archive.getArchiveItems();
    const studentItem = items.find((i) => i.kind === "student")!;
    const groupItem = items.find((i) => i.kind === "group")!;
    expect((await archive.restoreArchiveAction(studentItem._id)).success).toBe(false);
    expect((await archive.purgeArchiveAction(groupItem._id)).success).toBe(false);

    expect((await archive.restoreArchiveAction(groupItem._id)).success).toBe(true);
    expect((await Group.findById(group._id))!.name).toBe("G-1");
    expect((await archive.restoreArchiveAction(studentItem._id)).success).toBe(true);
  });

  it("dars javoblari bilan arxivlanadi; o'quvchi ham arxivda bo'lsa uning javobi o'quvchi arxiviga o'tadi", async () => {
    const { student, lesson } = await seed();
    expect((await lessons.deleteLessonAction(lesson._id.toString())).success).toBe(true);
    expect(await Lesson.countDocuments()).toBe(0);
    expect(await HomeworkSubmission.countDocuments()).toBe(0);

    await students.deleteStudentAction(student._id.toString());
    const lessonItem = (await archive.getArchiveItems()).find((i) => i.kind === "lesson")!;
    expect((await archive.restoreArchiveAction(lessonItem._id)).success).toBe(true);
    expect(await Lesson.countDocuments({ _id: lesson._id })).toBe(1);
    // O'quvchi yo'q — uning javobi egasiz qolib ketmaydi
    expect(await HomeworkSubmission.countDocuments()).toBe(0);

    await archive.restoreArchiveAction((await onlyArchive())._id);
    expect(await HomeworkSubmission.countDocuments({ lessonId: lesson._id, studentId: student._id })).toBe(1);
  });

  it("davomat arxivlanganda coin qaytariladi, tiklanganda qayta beriladi", async () => {
    const { student, session } = await seed();
    expect((await attendance.deleteAttendanceSessionAction(session._id.toString())).success).toBe(true);
    expect(await AttendanceSession.countDocuments()).toBe(0);
    expect(await AttendanceRecord.countDocuments()).toBe(0);
    expect((await User.findById(student._id))!.totalCoins).toBe(20);

    expect((await archive.restoreArchiveAction((await onlyArchive())._id)).success).toBe(true);
    expect(await AttendanceRecord.countDocuments({ sessionId: session._id })).toBe(1);
    expect((await User.findById(student._id))!.totalCoins).toBe(25);
  });

  it("o'quvchi arxivdan foydalana olmaydi", async () => {
    const { student } = await seed();
    await students.deleteStudentAction(student._id.toString());
    const item = await onlyArchive();
    actAs(sessionFor(student));
    await expect(archive.getArchiveItems()).rejects.toThrow();
    await expect(archive.restoreArchiveAction(item._id)).rejects.toThrow();
    await expect(archive.purgeArchiveAction(item._id)).rejects.toThrow();
  });
});
