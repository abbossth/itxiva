import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
const notifyMany = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn(), notifyMany: (...a: unknown[]) => notifyMany(...a), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Quest } = await import("@/lib/db/models/quest.model");
const { QuestSubmission } = await import("@/lib/db/models/quest-submission.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const { ensureSystemQuests, dailyCheckIn, trackMaterialView } = await import("@/lib/gamification/quests");
const { rewardQuizAnswers } = await import("@/lib/gamification/quiz-rewards");
const { stepStreak } = await import("@/lib/gamification/streak");
const questActions = await import("@/actions/quest.actions");
const studentQuests = await import("@/actions/student-quest.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  notifyMany.mockClear();
});

async function seed(gamification: Record<string, unknown> = {}) {
  await AppSettings.create({ key: "global", gamification: { enabled: true, ...gamification } });
  const g1 = await Group.create({ name: "8.2", grade: 8, academicYear: "2026-2027" });
  const g2 = await Group.create({ name: "11.1", grade: 11, academicYear: "2026-2027" });
  const mk = (login: string, role: "mentor" | "student", groupId: mongoose.Types.ObjectId | null = null) =>
    User.create({ login, fullName: login, role, groupId, passwordHash: "x", mustChangePassword: false });
  return { g1, g2, mentor: await mk("mentor", "mentor"), ali: await mk("ali", "student", g1._id), vali: await mk("vali", "student", g2._id) };
}

const baseQuest = {
  title: "Portfolio sayt",
  description: "",
  difficulty: "medium",
  verify: "mentor",
  template: null,
  autoRule: null,
  evidence: { link: "required", file: false, certId: false, note: true },
  guard: { uniqueProof: true, dateAfterJoin: false, monthlyLimit: null },
  reward: { coinsMin: 80, coinsMax: 80, xp: null, places: [] },
  audience: { groupIds: [] as string[], grades: [] as number[] },
  repeat: "once",
  startsAt: null,
  endsAt: null,
  notify: { announce: true, onSubmission: true },
  publish: true,
};

describe("seriya", () => {
  it("ketma-ket kun +1; bir kun o'tkazilsa himoya yopadi; himoyasiz qayta boshlanadi; bir kunda o'zgarmaydi", () => {
    expect(stepStreak({ current: 4, best: 6, lastDayKey: "2026-10-15" }, "2026-10-16", 0)).toMatchObject({ next: { current: 5, best: 6 }, usedShield: false });
    expect(stepStreak({ current: 4, best: 4, lastDayKey: "2026-10-14" }, "2026-10-16", 1)).toMatchObject({ next: { current: 5, best: 5 }, usedShield: true });
    expect(stepStreak({ current: 4, best: 4, lastDayKey: "2026-10-14" }, "2026-10-16", 0)).toMatchObject({ next: { current: 1, best: 4 } });
    expect(stepStreak({ current: 4, best: 4, lastDayKey: "2026-10-13" }, "2026-10-16", 3)).toMatchObject({ next: { current: 1 }, usedShield: false });
    expect(stepStreak({ current: 4, best: 4, lastDayKey: "2026-10-16" }, "2026-10-16", 0).unchanged).toBe(true);
    expect(stepStreak(null, "2026-10-16", 0).next).toEqual({ current: 1, best: 1, lastDayKey: "2026-10-16" });
    // Oy va yil chegarasi
    expect(stepStreak({ current: 9, best: 9, lastDayKey: "2026-12-31" }, "2027-01-01", 0).next.current).toBe(10);
  });
});

describe("kunlik topshiriqlar", () => {
  it("standart topshiriqlar bir marta yaratiladi", async () => {
    await seed();
    expect(await ensureSystemQuests()).toBe(3);
    expect(await ensureSystemQuests()).toBe(0);
    expect(await Quest.countDocuments({ isSystem: true })).toBe(3);
  });

  it("kirish: kuniga bir marta coin va seriya; parallel chaqiruv ikki marta bermaydi", async () => {
    const { ali } = await seed({ dailyLoginCoins: 2 });
    await ensureSystemQuests();
    await Promise.all([dailyCheckIn(ali._id), dailyCheckIn(ali._id), dailyCheckIn(ali._id)]);
    const u = await User.findById(ali._id).lean();
    expect(u).toMatchObject({ spendableBalance: 2, xp: 2, streak: { current: 1, best: 1 } });
    expect(await CoinLedger.countDocuments({ studentId: ali._id, type: "login" })).toBe(1);
  });

  it("test: savol uchun bir marta, kunlik chegara; 10 ta javobdan keyin kunlik topshiriq bajariladi", async () => {
    const { ali } = await seed({ quizCoinPerQuestion: 2, quizDailyCap: 10 });
    await ensureSystemQuests();
    const answers = Array.from({ length: 10 }, (_, i) => ({ questionId: `q${i}`, isCorrect: i < 8 }));
    // 8 ta to'g'ri × 2 = 16, lekin chegara 10
    expect(await rewardQuizAnswers(ali._id, answers)).toBe(10);
    expect(await rewardQuizAnswers(ali._id, answers)).toBe(0);
    expect(await CoinLedger.countDocuments({ studentId: ali._id, type: "quiz" })).toBe(5);
    // "10 ta test yeching" (5 coin, 10 XP) bajarildi
    const tests = await Quest.findOne({ "autoRule.kind": "tests_today" });
    expect(await QuestSubmission.countDocuments({ questId: tests!._id, studentId: ali._id, status: "approved" })).toBe(1);
    expect(await User.findById(ali._id).lean()).toMatchObject({ spendableBalance: 15, xp: 20 });
  });

  it("material ochish topshirig'i; gamifikatsiya o'chiq bo'lsa hech narsa yozilmaydi", async () => {
    const { ali } = await seed();
    await ensureSystemQuests();
    await trackMaterialView(ali._id, "materials/a.pdf");
    await trackMaterialView(ali._id, "materials/a.pdf");
    expect(await CoinLedger.countDocuments({ studentId: ali._id, type: "quest" })).toBe(1);

    await AppSettings.updateOne({ key: "global" }, { $set: { "gamification.enabled": false } });
    await QuestSubmission.deleteMany({});
    await trackMaterialView(ali._id, "materials/b.pdf");
    expect(await QuestSubmission.countDocuments()).toBe(0);
  });
});

describe("mentor: topshiriq yaratish", () => {
  it("validatsiya va mukofot chegarasi; e'lon qilinganda auditoriyaga xabar", async () => {
    const { mentor, ali, g1 } = await seed({ mentorBonusMax: 100 });
    actAs(sessionFor(mentor));
    expect((await questActions.saveQuestAction({ ...baseQuest, reward: { coinsMin: 80, coinsMax: 150, xp: null, places: [] } })).message).toMatch(/100 coin/);
    expect((await questActions.saveQuestAction({ ...baseQuest, verify: "auto" })).message).toMatch(/shartni/);
    expect((await questActions.saveQuestAction({ ...baseQuest, reward: { coinsMin: 50, coinsMax: 40, xp: null, places: [] } })).success).toBe(false);

    const res = await questActions.saveQuestAction({ ...baseQuest, audience: { groupIds: [String(g1._id)], grades: [] } });
    expect(res.success).toBe(true);
    expect(notifyMany).toHaveBeenCalledTimes(1);
    expect((notifyMany.mock.calls[0][0] as mongoose.Types.ObjectId[]).map(String)).toEqual([String(ali._id)]);

    // O'quvchi hech qanday topshiriq yarata olmaydi
    actAs(sessionFor(ali));
    await expect(questActions.saveQuestAction(baseQuest)).rejects.toThrow();
  });

  it("o'quvchi faqat o'z guruhiga tegishli, e'lon qilingan va faol topshiriqni ko'radi", async () => {
    const { mentor, ali, vali, g1 } = await seed();
    actAs(sessionFor(mentor));
    await questActions.saveQuestAction({ ...baseQuest, title: "Faqat 8.2", audience: { groupIds: [String(g1._id)], grades: [] } });
    await questActions.saveQuestAction({ ...baseQuest, title: "11-sinf", audience: { groupIds: [], grades: [11] } });
    await questActions.saveQuestAction({ ...baseQuest, title: "Qoralama", publish: false });
    const paused = await questActions.saveQuestAction({ ...baseQuest, title: "To'xtatilgan" });
    await questActions.setQuestActiveAction(paused.data!.id, false);

    actAs(sessionFor(ali));
    const a = await studentQuests.getStudentQuestsData();
    expect(a?.main.map((c) => c.quest.title)).toEqual(["Faqat 8.2"]);
    actAs(sessionFor(vali));
    const v = await studentQuests.getStudentQuestsData();
    expect(v?.main.map((c) => c.quest.title)).toEqual(["11-sinf"]);
  });
});
