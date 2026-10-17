import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";
import { highlightRanges, normalizeSearch, queryTokens, rankItems } from "@/lib/search";

// Qidiruv palitrasi: matn solishtirish va har rol uchun ko'rinadigan ma'lumotlar

vi.mock("@/lib/auth/guards", () => guardsMock);

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { Exam } = await import("@/lib/db/models/exam.model");
const { Product } = await import("@/lib/db/models/product.model");
const { getSearchIndex } = await import("@/actions/search.actions");

describe("matn solishtirish", () => {
  it("apostrof, registr va kirill farqi yo'q", () => {
    expect(normalizeSearch("Oʻzbekiston")).toBe(normalizeSearch("o'zbekiston"));
    expect(normalizeSearch("ДАРС")).toBe("dars");
    expect(normalizeSearch("ўқувчи")).toBe("oquvchi");
    expect(queryTokens("  HTML   forma ")).toEqual(["html", "forma"]);
  });

  it("hamma so'zlar topilishi shart; sarlavha boshidan topilgani birinchi", () => {
    const items = [
      { title: "CSS asoslari", keywords: "html" },
      { title: "Formalar bilan ishlash HTML da" },
      { title: "HTML formalar" },
      { title: "JavaScript" },
    ];
    expect(rankItems(items, "html").map((r) => r.item.title)).toEqual(["HTML formalar", "Formalar bilan ishlash HTML da", "CSS asoslari"]);
    expect(rankItems(items, "html forma").map((r) => r.item.title)).toEqual(["HTML formalar", "Formalar bilan ishlash HTML da"]);
    expect(rankItems(items, "python")).toEqual([]);
  });

  it("belgilash asl matndagi o'rinni beradi (apostrof bo'lsa ham)", () => {
    expect(highlightRanges("Qo'llanma va qo'llanma", ["qollanma"])).toEqual([
      [0, 9],
      [13, 22],
    ]);
    expect(highlightRanges("HTML formalar", ["html", "form"])).toEqual([
      [0, 4],
      [5, 9],
    ]);
  });
});

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function seed() {
  const g82 = await Group.create({ name: "8.2", grade: 8, academicYear: "2026-2027" });
  const g810 = await Group.create({ name: "8.10", grade: 8, academicYear: "2026-2027" });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const ali = await User.create({ login: "ali", fullName: "Ali Valiyev", role: "student", groupId: g82._id, passwordHash: "x" });
  await User.create({ login: "vali", fullName: "Vali Aliyev", role: "student", groupId: g810._id, passwordHash: "x" });
  const open = await Lesson.create({
    groupId: g82._id,
    quarter: 1,
    order: 1,
    title: "HTML formalar",
    isPublished: true,
    materials: [{ type: "youtube", title: "Forma videosi", urlOrKey: "https://youtu.be/x" }],
    homework: { isEnabled: true, instructions: "Forma yasang", attachments: [], dueAt: null, coinsReward: 20 },
  });
  await Quiz.create({ lessonId: open._id, title: "Test", questions: [], isPublished: false });
  await Lesson.create({ groupId: g82._id, quarter: 1, order: 2, title: "Qoralama dars", isPublished: false, materials: [] });
  await Lesson.create({ groupId: g810._id, quarter: 1, order: 1, title: "Boshqa guruh darsi", isPublished: true, materials: [] });
  const now = Date.now();
  await Exam.create({
    groupIds: [g82._id],
    quarter: 1,
    title: "1-chorak imtihoni",
    startTime: new Date(now - 3600_000),
    endTime: new Date(now + 3600_000),
    durationMinutes: 40,
    isPublished: true,
    questions: [],
  });
  await Exam.create({ groupIds: [g810._id], quarter: 1, title: "8.10 imtihoni", startTime: new Date(now), endTime: new Date(now + 1), durationMinutes: 40, isPublished: true, questions: [] });
  await Product.create({ title: "Ruchka", price: 50, realPrice: 987_654, stock: null, isActive: true });
  await Product.create({ title: "Yashirin sovg'a", price: 90, stock: null, isActive: false });
  return { mentor, ali, open };
}

describe("getSearchIndex", () => {
  it("o'quvchi faqat o'z guruhining nashr etilgan darslari, materiallari, imtihonlari va faol mahsulotlarni ko'radi", async () => {
    const { ali, open } = await seed();
    actAs(sessionFor(ali));
    const items = await getSearchIndex();
    const titles = items.map((i) => i.title);

    expect(titles).toContain("HTML formalar");
    expect(titles).toContain("Forma videosi");
    expect(titles).toContain("1-chorak imtihoni");
    expect(titles).toContain("Ruchka");
    expect(titles).not.toContain("Qoralama dars");
    expect(titles).not.toContain("Boshqa guruh darsi");
    expect(titles).not.toContain("8.10 imtihoni");
    expect(titles).not.toContain("Yashirin sovg'a");
    // Boshqa o'quvchilar va mentor ma'lumotlari o'quvchiga berilmaydi
    expect(items.some((i) => i.kind === "student" || i.kind === "group")).toBe(false);
    expect(JSON.stringify(items)).not.toContain("987654");

    const lesson = items.find((i) => i.kind === "lesson" && i.title === "HTML formalar")!;
    expect(lesson.href).toBe(`/lessons/${open._id}`);
    expect(lesson.subtitle).toContain("Vazifa");
    // Yopiq test o'quvchiga "Test" deb ko'rsatilmaydi
    expect(lesson.subtitle).not.toContain("Test");
    expect(items.find((i) => i.title === "Forma videosi")?.href).toBe(`/lessons/${open._id}`);
    expect(items.find((i) => i.title === "1-chorak imtihoni")?.href).toMatch(/^\/exams\/[a-f0-9]{24}$/);
  });

  it("mentor hamma darslar, o'quvchilar, guruhlar va mahsulotlarni ko'radi", async () => {
    const { mentor } = await seed();
    actAs(sessionFor(mentor));
    const items = await getSearchIndex();
    const titles = items.map((i) => i.title);

    expect(titles).toEqual(expect.arrayContaining(["Qoralama dars", "Boshqa guruh darsi", "Ali Valiyev", "Vali Aliyev", "8.2", "8.10", "Yashirin sovg'a"]));
    const student = items.find((i) => i.title === "Ali Valiyev")!;
    expect(student.href).toMatch(/^\/mentor\/students\//);
    expect(student.subtitle).toContain("8.2");
    expect(items.find((i) => i.title === "Qoralama dars")?.subtitle).toContain("Qoralama");
    expect(rankItems(items, "vali")[0].item.title).toBe("Vali Aliyev");
  });
});
