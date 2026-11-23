import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
// AI soxta: to'g'ri javobni qisqartirib, noto'g'rilarni shu uzunlikda yozadi
const generateStructured = vi.fn();
vi.mock("@/lib/ai/claude", async (orig) => ({ ...(await orig<object>()), isAiConfigured: () => true, generateStructured: (p: unknown) => generateStructured(p) }));

const { User } = await import("@/lib/db/models/user.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const ai = await import("@/actions/ai.actions");
const { acceptBalanced } = await import("@/lib/ai/rebalance-options");
const { seededShuffle, answerLengthBias } = await import("@/lib/quiz-quality");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  generateStructured.mockReset();
});

const LONG = "Ma'lumotlarni vaqtincha saqlaydigan va elektr o'chganda o'chib ketadigan tezkor xotira";
const biasedQ = { type: "single_choice" as const, prompt: "RAM nima?", options: ["Disk", "Monitor", LONG, "Sichqoncha"], correctAnswers: [LONG] };

describe("variantlarni tenglashtirish natijasini tekshirish", () => {
  it("yaxshi natija qabul qilinadi, to'g'ri javob indeks bo'yicha olinadi", () => {
    const r = acceptBalanced(biasedQ, ["Doimiy xotira qurilmasi", "Tezkor vaqtinchalik xotira", "Tasvir chiqarish qurilmasi", "Kiritish qurilmasi turi"], [1]);
    expect(r).toEqual({ options: ["Doimiy xotira qurilmasi", "Tezkor vaqtinchalik xotira", "Tasvir chiqarish qurilmasi", "Kiritish qurilmasi turi"], correctAnswers: ["Tezkor vaqtinchalik xotira"] });
    expect(answerLengthBias({ type: "single_choice", ...r! }).biased).toBe(false);
  });
  it("variantlar soni, to'g'ri javoblar soni o'zgarsa yoki takror bo'lsa — rad etiladi", () => {
    expect(acceptBalanced(biasedQ, ["a", "b", "c"], [0])).toBeNull();
    expect(acceptBalanced(biasedQ, ["a", "b", "c", "d"], [0, 1])).toBeNull();
    expect(acceptBalanced(biasedQ, ["a", "a", "c", "d"], [0])).toBeNull();
    expect(acceptBalanced(biasedQ, ["a", "b", "c", "d"], [7])).toBeNull();
  });
  it("hali ham uzunligidan bilinsa va yaxshilanmagan bo'lsa — rad etiladi", () => {
    expect(acceptBalanced(biasedQ, ["Disk", "Monitor", LONG + " va yana", "Sichqoncha"], [2])).toBeNull();
  });
});

describe("variantlarni aralashtirish", () => {
  it("bir xil kalit — bir xil tartib, elementlar yo'qolmaydi", () => {
    const a = seededShuffle(["A", "B", "C", "D"], "ali:q1");
    expect(seededShuffle(["A", "B", "C", "D"], "ali:q1")).toEqual(a);
    expect([...a].sort()).toEqual(["A", "B", "C", "D"]);
    // Turli o'quvchilarda tartib har xil bo'ladi (20 ta kalitdan kamida bittasi farq qiladi)
    const orders = new Set(Array.from({ length: 20 }, (_, i) => seededShuffle(["A", "B", "C", "D"], `s${i}:q1`).join("")));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("barcha testlarni AI bilan tuzatish", () => {
  it("uzunligidan bilinadigan savollar hisobotda ko'rinadi, boshqalari yo'q", async () => {
    const mentor = await User.create({ fullName: "Ustoz", login: "ustoz", passwordHash: "x".repeat(60), role: "mentor" });
    const quiz = await Quiz.create({
      lessonId: new (await import("mongoose")).default.Types.ObjectId(),
      title: "Xotira",
      isPublished: true,
      questions: [
        { ...biasedQ, points: 1 },
        { type: "single_choice", prompt: "2+2?", options: ["3", "4", "5"], correctAnswers: ["4"], points: 1 },
      ],
    });
    actAs(sessionFor(mentor));
    const report = await ai.quizQualityReportAction();
    expect(report.success && report.data?.total).toBe(1);
    expect(report.success && report.data?.items[0]).toMatchObject({ kind: "quiz", docId: String(quiz._id), title: "Xotira" });
  });

  it("AI generatori 20 ta savolgacha tuzadi va uzunligidan bilinganlarini tenglashtiradi", async () => {
    const mentor = await User.create({ fullName: "Ustoz", login: "ustoz", passwordHash: "x".repeat(60), role: "mentor" });
    actAs(sessionFor(mentor));
    const many = Array.from({ length: 20 }, (_, i) => ({ type: "single_choice", prompt: `Savol ${i + 1}?`, options: ["Bir", "Ikki", "Uch", "To'rt"], correctAnswers: ["Ikki"], explanation: "-" }));
    many[0] = { ...biasedQ, explanation: "-" };
    generateStructured
      .mockResolvedValueOnce({ questions: many })
      .mockResolvedValueOnce({ items: [{ id: 0, options: ["Doimiy xotira qurilmasi", "Tezkor vaqtinchalik xotira", "Tasvir chiqarish qurilmasi", "Kiritish qurilmasi turi"], correctIndexes: [1] }] });
    const r = await ai.generateQuizAction({ title: "Kompyuter xotirasi" }, 20);
    expect(r.success && r.data?.questions).toHaveLength(20);
    expect(r.success && r.data?.balanced).toBe(1);
    expect(r.success && r.data?.questions[0].correctAnswers).toEqual(["Tezkor vaqtinchalik xotira"]);
    const prompt = (generateStructured.mock.calls[0][0] as { prompt: string }).prompt;
    expect(prompt).toContain("20 ta test savoli");
    expect(prompt).toContain("deyarli bir xil uzunlikda");
  });
});
