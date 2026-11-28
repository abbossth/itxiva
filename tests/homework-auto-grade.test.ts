import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const afterJobs: Promise<unknown>[] = [];
vi.mock("next/server", () => ({ after: (job: () => unknown) => void afterJobs.push(Promise.resolve(job())) }));
const flushAfter = async () => {
  await Promise.all(afterJobs.splice(0));
};
vi.mock("@/lib/ai/detect-ai", () => ({ estimateAiWriting: async () => ({ score: 10, signals: [] }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
const notify = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify, notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn(), notifyAllStudents: vi.fn() }));

type Review = {
  checks: { task: string; student: string; expected: string; verdict: "correct" | "partial" | "wrong" | "missing" | "unchecked"; comment: string }[];
  score: number;
  feedback: string;
  confidence: "high" | "medium" | "low";
  originality: { aiSignals: string[]; aiLikelihood: "low" | "medium" | "high"; copySignals: string[]; copyLikelihood: "low" | "medium" | "high"; verifyQuestions: string[] };
};
const good: Review = {
  checks: [{ task: "1)", student: "<h1>", expected: "<h1>", verdict: "correct", comment: "" }],
  score: 85,
  feedback: "Yaxshi ish! Sarlavha to'g'ri.",
  confidence: "high",
  originality: { aiSignals: [], aiLikelihood: "low", copySignals: [], copyLikelihood: "low", verifyQuestions: ["h1 nima?"] },
};
let next: Review | Error = good;
const generate = vi.fn(async () => {
  if (next instanceof Error) throw next;
  return next;
});
vi.mock("@/lib/ai/claude", () => ({
  generateStructured: () => generate(),
  isAiConfigured: () => true,
  AiError: class extends Error {},
  AI_READABLE_TYPES: ["image/png", "application/pdf"],
}));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { HomeworkSubmission } = await import("@/lib/db/models/homework-submission.model");
const hw = await import("@/actions/homework.actions");
const { autoGradeBlockers } = await import("@/lib/homework-auto-grade");
const { retryFailedAiWork } = await import("@/lib/ai/retry");

async function seed() {
  const group = await Group.create({ name: "G-1", grade: 8, academicYear: "2026-2027" });
  const mk = (login: string, role: "mentor" | "student", groupId: mongoose.Types.ObjectId | null = null) =>
    User.create({ login, fullName: login, role, groupId, passwordHash: "x", totalCoins: 0, spendableBalance: 0 });
  const mentor = await mk("mentor", "mentor");
  const student = await mk("ali", "student", group._id);
  const lesson = await Lesson.create({
    groupId: group._id,
    quarter: 1,
    order: 1,
    title: "HTML",
    isPublished: true,
    homework: { isEnabled: true, instructions: "1) Sarlavha yozing", attachments: [], dueAt: null, coinsReward: 20 },
  });
  return { mentor, student, lessonId: lesson._id.toString() };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  next = good;
  generate.mockClear();
  notify.mockClear();
});

describe("AI avtomatik baholash", () => {
  it("javob yuborilgach AI o'zi baholaydi: ball, izoh, coin (mentor formulasi), daftar va xabar", async () => {
    const { student, lessonId } = await seed();
    actAs(sessionFor(student));
    expect((await hw.submitHomeworkAction({ lessonId, text: "<h1>Salom</h1>", links: [], files: [] })).success).toBe(true);
    await flushAfter();
    const sub = await HomeworkSubmission.findOne({ studentId: student._id }).lean();
    expect(sub).toMatchObject({ status: "graded", score: 85, coinsAwarded: 17, autoGraded: true, gradedBy: null, aiGrade: { status: "done" } });
    expect(sub?.feedback).toContain("Yaxshi ish!");
    expect(sub?.feedback).toContain("IT Xiva AI");
    const u = await User.findById(student._id).lean();
    expect(u).toMatchObject({ totalCoins: 17, spendableBalance: 17 });
    expect(await CoinLedger.countDocuments({ studentId: student._id, type: "homework", amount: 17 })).toBe(1);
    expect(notify).toHaveBeenCalledWith(student._id, "homework_graded", expect.objectContaining({ score: 85, coins: 17 }));
  });

  it("mentor AI bahosini o'zgartirsa — faqat coin farqi yoziladi va bu endi mentor bahosi", async () => {
    const { student, mentor, lessonId } = await seed();
    actAs(sessionFor(student));
    await hw.submitHomeworkAction({ lessonId, text: "<h1>Salom</h1>", links: [], files: [] });
    await flushAfter();
    const sub = await HomeworkSubmission.findOne({ studentId: student._id }).lean();
    actAs(sessionFor(mentor));
    expect((await hw.gradeHomeworkAction({ submissionId: String(sub!._id), score: 100, coins: 20, feedback: "Zo'r" })).success).toBe(true);
    const after = await HomeworkSubmission.findById(sub!._id).lean();
    expect(after).toMatchObject({ score: 100, coinsAwarded: 20, autoGraded: false });
    expect((await User.findById(student._id).lean())?.totalCoins).toBe(20);
    expect(await CoinLedger.countDocuments({ studentId: student._id })).toBe(2);
  });

  it("AI ishonchi past yoki AI yozgan bo'lishi mumkin — baholamaydi, mentorga qoldiradi", async () => {
    const { student, lessonId } = await seed();
    next = { ...good, confidence: "low" };
    actAs(sessionFor(student));
    await hw.submitHomeworkAction({ lessonId, text: "<h1>Salom</h1>", links: [], files: [] });
    await flushAfter();
    const sub = await HomeworkSubmission.findOne({ studentId: student._id }).lean();
    expect(sub).toMatchObject({ status: "submitted", autoGraded: false, coinsAwarded: 0, aiGrade: { status: "done" } });
    expect(sub?.aiGrade?.note).toContain("Mentorga qoldirildi");
    expect(sub?.aiGrade?.note).toContain("85 ball");
  });

  it("AI ishlamasa — failed; keyin qayta urinishda baholanadi", async () => {
    const { student, lessonId } = await seed();
    next = new Error("AI xizmati hozir band");
    actAs(sessionFor(student));
    await hw.submitHomeworkAction({ lessonId, text: "<h1>Salom</h1>", links: [], files: [] });
    await flushAfter();
    let sub = await HomeworkSubmission.findOne({ studentId: student._id }).lean();
    expect(sub).toMatchObject({ status: "submitted", aiGrade: { status: "failed" } });
    expect(sub?.aiGrade?.note).toContain("band");
    // 30 daqiqa o'tdi, AI tuzaldi
    await HomeworkSubmission.updateOne({ _id: sub!._id }, { $set: { "aiGrade.at": new Date(Date.now() - 31 * 60_000) } });
    next = good;
    const r = await retryFailedAiWork({ useLock: false });
    expect(r.homework).toBe(1);
    sub = await HomeworkSubmission.findById(sub!._id).lean();
    expect(sub).toMatchObject({ status: "graded", score: 85, autoGraded: true });
  });

  it("matn ham, o'qiladigan fayl ham bo'lmasa — AI baholamaydi (skipped)", async () => {
    const { student, lessonId } = await seed();
    actAs(sessionFor(student));
    await hw.submitHomeworkAction({ lessonId, text: "", links: ["https://github.com/ali/loyiha"], files: [] });
    await flushAfter();
    const sub = await HomeworkSubmission.findOne({ studentId: student._id }).lean();
    expect(sub).toMatchObject({ status: "submitted", aiGrade: { status: "skipped" } });
    expect(generate).not.toHaveBeenCalled();
  });

  it("to'siqlar: ishonch, AI yozgan, ko'chirilgan, ko'rilmagan qismlar", () => {
    const base = { confidence: good.confidence, originality: good.originality, checks: good.checks };
    expect(autoGradeBlockers(base, 10)).toEqual([]);
    expect(autoGradeBlockers(base, 75)).toEqual(["boshqa javobga juda o'xshash"]);
    expect(autoGradeBlockers({ ...base, originality: { ...good.originality, aiLikelihood: "high" } }, 0)).toEqual(["AI yordamida yozilgan bo'lishi mumkin"]);
    expect(
      autoGradeBlockers({ ...base, checks: [{ ...good.checks[0], verdict: "unchecked" }, { ...good.checks[0], verdict: "unchecked" }, good.checks[0]] }, 0)
    ).toEqual(["javobning ko'p qismini ko'ra olmadi"]);
  });
});
