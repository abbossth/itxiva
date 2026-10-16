import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

// Bir dars bir necha guruhda: vazifa va test har guruhda alohida ochiladi

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
const notifyGroup = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({
  notifyGroup: (...a: unknown[]) => notifyGroup(...a),
  notify: vi.fn(),
  notifyMany: vi.fn(),
  notifyMentors: vi.fn(),
  notifyAllStudents: vi.fn(),
  sendNotifications: vi.fn(),
}));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const lessons = await import("@/actions/lesson.actions");
const quizzes = await import("@/actions/quiz.actions");
const homework = await import("@/actions/homework.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  notifyGroup.mockClear();
});

const question = { type: "single_choice" as const, prompt: "2 + 2?", options: ["3", "4"], correctAnswers: ["4"], points: 1 };

async function seed() {
  const schedule = { days: [1, 3, 5], startTime: "16:30", endTime: "18:00" };
  const g82 = await Group.create({ name: "8.2", grade: 8, academicYear: "2026-2027", schedule });
  const g810 = await Group.create({ name: "8.10", grade: 8, academicYear: "2026-2027", schedule });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const s82 = await User.create({ login: "ali", fullName: "Ali", role: "student", groupId: g82._id, passwordHash: "x" });
  const s810 = await User.create({ login: "vali", fullName: "Vali", role: "student", groupId: g810._id, passwordHash: "x" });
  const lesson = await Lesson.create({
    groupId: g82._id,
    quarter: 1,
    order: 1,
    title: "HTML formalar",
    isPublished: true,
    materials: [{ type: "link", title: "Qo'llanma", urlOrKey: "https://example.com" }],
    homework: { isEnabled: false, instructions: "Forma yasang", attachments: [], dueAt: null, coinsReward: 20 },
  });
  await Quiz.create({ lessonId: lesson._id, title: "Test", questions: [question], isPublished: false });
  actAs(sessionFor(mentor));
  const res = await lessons.copyLessonToGroupsAction({ lessonId: String(lesson._id), groupIds: [String(g810._id)] });
  expect(res.success).toBe(true);
  const copy = (await Lesson.findOne({ groupId: g810._id }))!;
  return { g82, g810, mentor, s82, s810, lesson, copy };
}

describe("vazifa va test guruh bo'yicha", () => {
  it("nusxada vazifa va test yopiq; bir guruhda ochilsa, ikkinchisi yopiq qoladi; o'quvchi faqat darsni ko'radi", async () => {
    const { mentor, s82, s810, lesson, copy } = await seed();
    expect(copy.homework?.isEnabled).toBe(false);
    expect((await Quiz.findOne({ lessonId: copy._id }).lean())?.isPublished).toBe(false);

    // 8.2 da dars o'tdi: vazifa va test ochiladi
    actAs(sessionFor(mentor));
    expect((await lessons.setLessonVisibilityAction({ lessonId: String(lesson._id), homework: true, quiz: true })).success).toBe(true);
    const opened = (await Lesson.findById(lesson._id).lean())!;
    expect(opened.homework?.isEnabled).toBe(true);
    // Muddat guruhning keyingi darsiga qo'yildi
    expect(opened.homework?.dueAt).toBeInstanceOf(Date);
    expect(notifyGroup).toHaveBeenCalledWith(lesson.groupId, "lesson_new", expect.objectContaining({ homeworkOpened: true }));
    expect(notifyGroup).toHaveBeenCalledWith(lesson.groupId, "exam_new", expect.objectContaining({ kind: "quiz" }));

    // Mentor 8.2 darsini va testini tahrirladi — mazmun 8.10 ga o'tadi, ochiqlik o'tmaydi
    await lessons.updateLessonAction(String(lesson._id), {
      title: "HTML formalar (yangilangan)",
      homework: { isEnabled: true, instructions: "Yangi topshiriq", attachments: [], dueAt: null, coinsReward: 25 },
    });
    await quizzes.upsertQuizAction({ lessonId: String(lesson._id), title: "Test 2", questions: [question, { ...question, prompt: "3 + 3?", options: ["6", "7"], correctAnswers: ["6"] }], isPublished: true });
    const sib = (await Lesson.findById(copy._id).lean())!;
    expect(sib).toMatchObject({ title: "HTML formalar (yangilangan)", homework: { isEnabled: false, instructions: "Yangi topshiriq", coinsReward: 25 } });
    const sibQuiz = (await Quiz.findOne({ lessonId: copy._id }).lean())!;
    expect(sibQuiz).toMatchObject({ title: "Test 2", isPublished: false });
    expect(sibQuiz.questions).toHaveLength(2);

    // 8.10 o'quvchisi: dars ko'rinadi, vazifa va test yo'q, yopiq vazifa matni ham kelmaydi
    actAs(sessionFor(s810));
    const view = await lessons.getLessonById(String(copy._id));
    expect(view?.title).toBe("HTML formalar (yangilangan)");
    expect(view?.homework).toBeNull();
    expect(await homework.getHomeworkForStudent(String(copy._id))).toBeNull();
    expect((await quizzes.getQuizForLesson(String(copy._id))).data?.quiz).toBeNull();

    // 8.2 o'quvchisi: hammasi ochiq
    actAs(sessionFor(s82));
    expect(await homework.getHomeworkForStudent(String(lesson._id))).not.toBeNull();
    expect((await quizzes.getQuizForLesson(String(lesson._id))).data?.quiz?.title).toBe("Test 2");

    // Mentor 8.10 da yopiq vazifani ko'radi va bog'langan guruh holatini biladi
    actAs(sessionFor(mentor));
    expect(await homework.getHomeworkForStudent(String(copy._id))).not.toBeNull();
    expect(await lessons.getLinkedLessons(String(lesson._id))).toMatchObject([{ groupName: "8.10", homeworkOpen: false, quizOpen: false }]);
  });

  it("vazifasi yozilmagan darsni ochib bo'lmaydi; o'quvchi ocholmaydi", async () => {
    const { mentor, s82, copy } = await seed();
    await Lesson.updateOne({ _id: copy._id }, { $set: { homework: null } });
    actAs(sessionFor(mentor));
    expect(await lessons.setLessonVisibilityAction({ lessonId: String(copy._id), homework: true })).toMatchObject({ success: false });
    actAs(sessionFor(s82));
    await expect(lessons.setLessonVisibilityAction({ lessonId: String(copy._id), quiz: true })).rejects.toThrow();
  });
});
