import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";

vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));

const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { autoPublishTodayLessons } = await import("@/lib/auto-publish");
const notifyMod = await import("@/lib/notifications/notify");

// 2026-11-25 — chorshanba. Guruh darsi 16:30 (Toshkent) = 11:30 UTC
const at = (time: string) => new Date(`2026-11-25T${time}:00+05:00`);
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.mocked(notifyMod.notifyGroup).mockClear();
});

async function seed() {
  const group = await Group.create({ name: "8.2", grade: 8, schedule: { days: [1, 3, 5], startTime: "16:30", endTime: "18:00" } });
  const today = await Lesson.create({
    groupId: group._id,
    quarter: 1,
    order: 18,
    title: "Bugungi dars",
    date: day("2026-11-25"),
    isPublished: false,
    homework: { isEnabled: false, instructions: "Vazifa matni", attachments: [], dueAt: null, coinsReward: 10 },
  });
  const tomorrow = await Lesson.create({ groupId: group._id, quarter: 1, order: 19, title: "Keyingi dars", date: day("2026-11-27"), isPublished: false });
  await Quiz.create({ lessonId: today._id, title: "Test", isPublished: false, questions: [{ type: "single_choice", prompt: "?", options: ["a", "b"], correctAnswers: ["a"], points: 1 }] });
  return { group, today, tomorrow };
}

describe("kun darsini avtomatik nashr qilish", () => {
  it("dars boshlanmaguncha ochilmaydi; boshlanganda dars, vazifa (muddati bilan) va test ochiladi — faqat bugungisi", async () => {
    const { today, tomorrow } = await seed();
    expect(await autoPublishTodayLessons(at("16:00"))).toEqual({ published: 0 });

    expect(await autoPublishTodayLessons(at("16:31"))).toEqual({ published: 1 });
    const l = (await Lesson.findById(today._id).lean())!;
    expect(l.isPublished).toBe(true);
    expect(l.homework?.isEnabled).toBe(true);
    // Muddat — kamida bir hafta keyingi dars boshlanishi: 2-dekabr chorshanba 16:30
    expect(new Date(l.homework!.dueAt!).toISOString()).toBe("2026-12-02T11:30:00.000Z");
    expect((await Quiz.findOne({ lessonId: today._id }).lean())!.isPublished).toBe(true);
    expect((await Lesson.findById(tomorrow._id).lean())!.isPublished).toBe(false);
    expect(notifyMod.notifyGroup).toHaveBeenCalledWith(today.groupId, "lesson_new", expect.objectContaining({ lessonId: String(today._id), hasHomework: true }));
  });

  it("bir marta: mentor qoralamaga olsa qayta ochilmaydi; vazifasiz dars ham ochiladi", async () => {
    const { today } = await seed();
    await autoPublishTodayLessons(at("16:40"));
    await Lesson.updateOne({ _id: today._id }, { $set: { isPublished: false } });
    expect(await autoPublishTodayLessons(at("16:45"))).toEqual({ published: 0 });

    const g = await Group.create({ name: "9.2", grade: 9, schedule: { days: [1, 3, 5], startTime: "15:00", endTime: "16:30" } });
    const bare = await Lesson.create({ groupId: g._id, quarter: 1, order: 1, title: "Vazifasiz", date: day("2026-11-25"), isPublished: false });
    expect(await autoPublishTodayLessons(at("16:50"))).toEqual({ published: 1 });
    const b = (await Lesson.findById(bare._id).lean())!;
    expect(b.isPublished).toBe(true);
    expect(b.homework?.isEnabled ?? false).toBe(false);
  });

  it("mavjud kelajakdagi muddat o'zgarmaydi; nofaol guruh darsi ochilmaydi", async () => {
    const { today, group } = await seed();
    await Lesson.updateOne({ _id: today._id }, { $set: { "homework.dueAt": new Date("2026-12-04T11:30:00.000Z") } });
    await autoPublishTodayLessons(at("17:00"));
    expect(new Date((await Lesson.findById(today._id).lean())!.homework!.dueAt!).toISOString()).toBe("2026-12-04T11:30:00.000Z");

    await Group.updateOne({ _id: group._id }, { $set: { isActive: false } });
    const other = await Lesson.create({ groupId: group._id, quarter: 1, order: 30, title: "Nofaol", date: day("2026-11-25"), isPublished: false });
    await autoPublishTodayLessons(at("17:05"));
    expect((await Lesson.findById(other._id).lean())!.isPublished).toBe(false);
  });
});
