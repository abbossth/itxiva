import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";
import {
  dateFromKey,
  homeworkDueAfter,
  isLessonDay,
  lastLessonDayOnOrBefore,
  lessonDaysBefore,
  lessonDaysFrom,
  toDateKey,
} from "@/lib/schedule";

// Dars sanalari jadval bo'yicha: juft — Se/Pay/Sha, toq — Du/Chor/Ju; 8-dekabr dam olish.
// 2026-11-17 — seshanba, 2026-11-18 — chorshanba.

const juft = { days: [2, 4, 6], startTime: "08:00", endTime: "09:30" };
const toq = { days: [1, 3, 5], startTime: "13:30", endTime: "15:00" };

describe("jadval: dars kunlari va vazifa muddati", () => {
  it("dam olish kunida dars yo'q", () => {
    expect(isLessonDay(juft, "2026-12-08")).toBe(false);
    expect(isLessonDay(juft, "2026-12-10")).toBe(true);
    expect(isLessonDay(toq, "2026-11-17")).toBe(false);
  });

  it("ketma-ket dars kunlari dam olish kunini o'tkazib yuboradi", () => {
    expect(lessonDaysFrom(juft, "2026-12-03", 4)).toEqual(["2026-12-03", "2026-12-05", "2026-12-10", "2026-12-12"]);
    expect(lessonDaysBefore(juft, "2026-11-17", 3)).toEqual(["2026-11-14", "2026-11-12", "2026-11-10"]);
    expect(lastLessonDayOnOrBefore(toq, "2026-11-17")).toBe("2026-11-16");
    expect(lastLessonDayOnOrBefore(juft, "2026-11-17")).toBe("2026-11-17");
  });

  it("vazifa muddati — kamida bir hafta, keyingi dars boshlanishida", () => {
    expect(homeworkDueAfter(juft, "2026-11-17").getTime()).toBe(dateFromKey("2026-11-24", "08:00").getTime());
    // 1-dekabr + 7 = 8-dekabr dam olish -> 10-dekabr
    expect(homeworkDueAfter(juft, "2026-12-01").getTime()).toBe(dateFromKey("2026-12-10", "08:00").getTime());
    // Jadvalsiz: bir haftadan keyin kun oxiri
    expect(homeworkDueAfter(null, "2026-11-17").getTime()).toBe(dateFromKey("2026-11-24", "23:59").getTime());
  });
});

const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { replanLessonsFromAnchor, anchorOpenedLesson, rollForwardLessons } = await import("@/lib/lesson-plan");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const at = (key: string, time = "12:00") => dateFromKey(key, time);
const keyOf = (d?: Date | string | null) => (d ? toDateKey(d) : null);

async function seedGroup(name: string, schedule: typeof juft, count: number, staleFrom = "2026-10-01") {
  const group = await Group.create({ name, grade: 8, academicYear: "2026-2027", schedule });
  // Eski reja: darslar har kuni ketma-ket — haqiqiy darslardan orqada qolgan
  const lessons = [];
  for (let order = 1; order <= count; order++) {
    const [y, m, d] = staleFrom.split("-").map(Number);
    lessons.push(
      await Lesson.create({
        groupId: group._id,
        quarter: 1,
        order,
        title: `${order}-mavzu`,
        isPublished: true,
        date: new Date(Date.UTC(y, m - 1, d + order)),
        homework: { isEnabled: false, instructions: "Vazifa", attachments: [], dueAt: new Date(Date.UTC(y, m - 1, d + order + 2)), coinsReward: 20 },
      })
    );
  }
  return { group, lessons };
}

const datesOf = async (groupId: import("mongoose").Types.ObjectId) =>
  (await Lesson.find({ groupId }).sort({ order: 1 }).lean()).map((l) => ({
    order: l.order,
    date: keyOf(l.date),
    due: keyOf(l.homework?.dueAt),
    open: l.homework?.isEnabled,
  }));

describe("darslarni qayta rejalashtirish", () => {
  it("8.10: 16-dars 17-noyabr — oldingilari orqaga, keyingilari oldinga, 8-dekabr o'tkazib yuboriladi", async () => {
    const { group } = await seedGroup("8.10", juft, 24);
    const res = await replanLessonsFromAnchor({
      groupId: group._id,
      quarter: 1,
      anchor: { order: 16 },
      anchorKey: "2026-11-17",
      includePast: true,
      now: at("2026-11-17", "10:00"),
    });
    expect(res?.lessons).toBe(24);
    const rows = await datesOf(group._id);
    const byOrder = new Map(rows.map((r) => [r.order, r]));
    expect(byOrder.get(16)?.date).toBe("2026-11-17");
    expect(byOrder.get(15)?.date).toBe("2026-11-14");
    expect(byOrder.get(14)?.date).toBe("2026-11-12");
    expect(byOrder.get(17)?.date).toBe("2026-11-19");
    expect(byOrder.get(18)?.date).toBe("2026-11-21");
    // 22-dars 1-dekabr seshanba, 24-dars 5-dekabr; 8-dekabrga dars tushmaydi
    expect(byOrder.get(22)?.date).toBe("2026-12-01");
    expect(rows.every((r) => r.date !== "2026-12-08")).toBe(true);
    // Vazifa muddati: 16-dars -> 24-noyabr dars boshlanishi; 22-dars -> 8-dekabr emas, 10-dekabr
    expect(byOrder.get(16)?.due).toBe("2026-11-24");
    expect(byOrder.get(22)?.due).toBe("2026-12-10");
    // Sanalar Toshkent bo'yicha ham, UTC bo'yicha ham bir xil kun (muharrir toISOString bilan o'qiydi)
    const l16 = await Lesson.findOne({ groupId: group._id, order: 16 }).lean();
    expect(new Date(l16!.date!).toISOString().slice(0, 10)).toBe("2026-11-17");
  });

  it("ochiq vazifa muddati faqat uzaytiriladi, o'tib ketgani o'zgarmaydi", async () => {
    const { group, lessons } = await seedGroup("8.2", toq, 16);
    const pastDue = at("2026-11-10", "13:30");
    const soonDue = at("2026-11-20", "13:30");
    const lateDue = at("2026-12-20", "13:30");
    await Lesson.updateOne({ _id: lessons[11]._id }, { $set: { "homework.isEnabled": true, "homework.dueAt": pastDue } });
    await Lesson.updateOne({ _id: lessons[13]._id }, { $set: { "homework.isEnabled": true, "homework.dueAt": soonDue } });
    await Lesson.updateOne({ _id: lessons[12]._id }, { $set: { "homework.isEnabled": true, "homework.dueAt": lateDue } });

    await replanLessonsFromAnchor({
      groupId: group._id,
      quarter: 1,
      anchor: { order: 15 },
      anchorKey: "2026-11-18",
      includePast: true,
      now: at("2026-11-17", "10:00"),
    });
    const after = new Map((await Lesson.find({ groupId: group._id }).lean()).map((l) => [l.order, l]));
    expect(new Date(after.get(12)!.homework!.dueAt!).getTime()).toBe(pastDue.getTime());
    expect(new Date(after.get(13)!.homework!.dueAt!).getTime()).toBe(lateDue.getTime());
    // 14-dars 16-noyabr -> muddat kamida 23-noyabr
    expect(keyOf(after.get(14)?.date)).toBe("2026-11-16");
    expect(keyOf(after.get(14)?.homework?.dueAt)).toBe("2026-11-23");
    expect(keyOf(after.get(15)?.date)).toBe("2026-11-18");
  });

  it("vazifa ochilganda dars bugunga qo'yiladi va keyingi darslar suriladi", async () => {
    const { group, lessons } = await seedGroup("9.3", juft, 18);
    await Lesson.updateOne({ _id: lessons[12]._id }, { $set: { "homework.isEnabled": true } });
    await Lesson.updateOne({ _id: lessons[13]._id }, { $set: { "homework.isEnabled": true } });

    const res = await anchorOpenedLesson(lessons[13]._id, at("2026-11-17", "10:00"));
    expect(res).not.toBeNull();
    const rows = new Map((await datesOf(group._id)).map((r) => [r.order, r]));
    expect(rows.get(14)?.date).toBe("2026-11-17");
    expect(rows.get(15)?.date).toBe("2026-11-19");
    expect(rows.get(18)?.date).toBe("2026-11-26");
    // Oldingi o'tilgan darslarga tegilmaydi
    expect(rows.get(13)?.date).toBe(keyOf(lessons[12].date));

    // Eski darsni ochish rejani buzmaydi
    expect(await anchorOpenedLesson(lessons[5]._id, at("2026-11-19", "10:00"))).toBeNull();
  });

  it("o'tilmay qolgan dars keyingi dars kuniga suriladi (kunlik cron)", async () => {
    const { group, lessons } = await seedGroup("11.1", juft, 14);
    await replanLessonsFromAnchor({ groupId: group._id, quarter: 1, anchor: { order: 11 }, anchorKey: "2026-11-17", includePast: true });
    await Lesson.updateOne({ _id: lessons[10]._id }, { $set: { "homework.isEnabled": true } });

    // 19-noyabr davomat olingan — dars bo'lgan: surilmaydi
    const { AttendanceSession } = await import("@/lib/db/models/attendance-session.model");
    const session = await AttendanceSession.create({
      groupId: group._id,
      mentorId: group._id,
      date: at("2026-11-19", "08:05"),
      startTime: at("2026-11-19", "08:05"),
      status: "closed",
      currentCode: "1",
      currentToken: "t",
      codeRotatedAt: at("2026-11-19", "08:05"),
    });
    expect((await rollForwardLessons(at("2026-11-20", "09:00"))).moved).toBe(0);
    await session.deleteOne();

    // 19-noyabr (12-dars kuni) dars bo'lmadi va 12-dars ochilmadi -> 21-noyabr shanbaga suriladi
    const res = await rollForwardLessons(at("2026-11-20", "09:00"));
    expect(res.moved).toBeGreaterThan(0);
    const rows = new Map((await datesOf(group._id)).map((r) => [r.order, r]));
    expect(rows.get(11)?.date).toBe("2026-11-17");
    expect(rows.get(12)?.date).toBe("2026-11-21");
    expect(rows.get(13)?.date).toBe("2026-11-24");

    // Qayta chaqirilsa hech narsa o'zgarmaydi
    expect((await rollForwardLessons(at("2026-11-20", "09:00"))).moved).toBe(0);
  });
});

describe("bir martalik 1-chorak tuzatishi", () => {
  it("guruhlar qisqa nomi bo'yicha topiladi va faqat bir marta bajariladi", async () => {
    const { applyLessonDateFixes } = await import("@/lib/lesson-plan-fixes");
    const { AppSettings } = await import("@/lib/db/models/app-settings.model");
    // 8.2 jadvali noto'g'ri (juft) kiritilgan — tuzatishda toqqa o'zgaradi
    const { group: g82 } = await seedGroup("XSH-25I0802", juft, 18);
    const { group: g810 } = await seedGroup("XSH-26I0810", juft, 18);

    const report = await applyLessonDateFixes(at("2026-11-17", "11:00"));
    expect(report?.["9.2"]).toBe("guruh topilmadi");
    const r82 = new Map((await datesOf(g82._id)).map((r) => [r.order, r]));
    const r810 = new Map((await datesOf(g810._id)).map((r) => [r.order, r]));
    expect(r82.get(15)?.date).toBe("2026-11-18");
    expect(r82.get(14)?.date).toBe("2026-11-16");
    expect(r82.get(16)?.date).toBe("2026-11-20");
    expect(r810.get(16)?.date).toBe("2026-11-17");
    expect((await Group.findById(g82._id).lean())?.schedule?.days).toEqual([1, 3, 5]);
    expect((await AppSettings.findOne({ key: "global" }).lean())?.appliedFixes).toContain("2026-11-17-q1-lesson-dates");

    expect(await applyLessonDateFixes(at("2026-11-17", "11:05"))).toBeNull();
  });
});
