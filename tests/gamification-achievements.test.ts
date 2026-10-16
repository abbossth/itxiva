import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const notify = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({ notify: (...a: unknown[]) => notify(...a), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Quest } = await import("@/lib/db/models/quest.model");
const { QuestSubmission } = await import("@/lib/db/models/quest-submission.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { StudentBadge } = await import("@/lib/db/models/student-badge.model");
const { ActivityEvent } = await import("@/lib/db/models/activity-event.model");
const { AttendanceSession } = await import("@/lib/db/models/attendance-session.model");
const { AttendanceRecord } = await import("@/lib/db/models/attendance-record.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const { evaluateBadges, groupMonthAttendance } = await import("@/lib/gamification/achievements");
const { finalizeMonth, finalizeWeekly } = await import("@/lib/gamification/cron");
const { effectiveStreak } = await import("@/lib/gamification/streak");
const { weekKey } = await import("@/lib/gamification/periods");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  notify.mockClear();
  await AppSettings.create({ key: "global", gamification: { enabled: true, levelUpBonus: 0 } });
});

const student = (groupId: mongoose.Types.ObjectId | null = null, login = `s${Math.random().toString(36).slice(2, 7)}`) =>
  User.create({ login, fullName: login, role: "student", groupId, passwordHash: "x" });

async function attendance(groupId: mongoose.Types.ObjectId, date: string, statuses: [mongoose.Types.ObjectId, string][]) {
  const token = new mongoose.Types.ObjectId().toString();
  const { insertedId } = await AttendanceSession.collection.insertOne({ groupId, date: new Date(`${date}T10:00:00+05:00`), status: "closed", currentToken: token, currentCode: token.slice(-6) });
  await AttendanceRecord.collection.insertMany(statuses.map(([studentId, status]) => ({ sessionId: insertedId, studentId, groupId, status })));
}

describe("seriyani ko'rsatish", () => {
  it("kecha kirgan bo'lsa saqlanadi; uzilgan seriya 0; himoya bir kunni yopadi", () => {
    const s = { current: 12, best: 21, lastDayKey: "2026-10-15" };
    expect(effectiveStreak(s, "2026-10-16", 0)).toBe(12);
    expect(effectiveStreak(s, "2026-10-17", 1)).toBe(12);
    expect(effectiveStreak(s, "2026-10-17", 0)).toBe(0);
    expect(effectiveStreak(null, "2026-10-17", 0)).toBe(0);
  });

  it("hafta kaliti Toshkent bo'yicha: yakshanba 23:30 va dushanba 00:10 turli haftalar", () => {
    expect(weekKey(new Date("2026-10-18T23:30:00+05:00"))).toBe("2026-W42");
    expect(weekKey(new Date("2026-10-19T00:10:00+05:00"))).toBe("2026-W43");
    // UTC bo'yicha hali yakshanba, Toshkentda esa dushanba
    expect(weekKey(new Date("2026-10-18T19:30:00Z"))).toBe("2026-W43");
  });
});

describe("nishonlar", () => {
  it("bosqichga yetganda bir marta beriladi (coin bilan); qayta tekshirish hech narsa bermaydi", async () => {
    const s = await student();
    await ActivityEvent.insertMany(
      Array.from({ length: 55 }, (_, i) => ({ studentId: s._id, kind: "quiz_answer", dayKey: "2026-10-16", ref: `q${i}`, correct: true }))
    );
    expect(await evaluateBadges(s._id)).toEqual(["tests:bronze"]);
    expect(await evaluateBadges(s._id)).toEqual([]);
    await Promise.all([evaluateBadges(s._id), evaluateBadges(s._id)]);
    expect(await StudentBadge.countDocuments({ studentId: s._id })).toBe(1);
    expect(await CoinLedger.countDocuments({ studentId: s._id, type: "badge" })).toBe(1);
    expect((await User.findById(s._id).lean())?.spendableBalance).toBe(20);
  });
});

describe("oylik va haftalik yakunlar", () => {
  it("guruh chellenji: maqsadga yetgan guruhga bir marta, qayta ishga tushirish idempotent", async () => {
    const strong = await Group.create({ name: "8.2", grade: 8, academicYear: "2026-2027" });
    const weak = await Group.create({ name: "9.2", grade: 9, academicYear: "2026-2027" });
    const [a1, a2, b1] = await Promise.all([student(strong._id), student(strong._id), student(weak._id)]);
    await attendance(strong._id, "2026-09-10", [[a1._id, "present"], [a2._id, "late"]]);
    await attendance(strong._id, "2026-09-12", [[a1._id, "present"], [a2._id, "present"]]);
    await attendance(weak._id, "2026-09-10", [[b1._id, "absent"]]);
    await attendance(weak._id, "2026-09-12", [[b1._id, "present"]]);
    expect(Object.fromEntries(await groupMonthAttendance("2026-09"))).toEqual({ [String(strong._id)]: 100, [String(weak._id)]: 50 });

    await Quest.create({
      title: "Sentyabr chellenji",
      verify: "auto",
      autoRule: { kind: "group_challenge", target: 90 },
      reward: { coinsMin: 25, coinsMax: 25, xp: null, places: [] },
      audience: { groupIds: [], grades: [] },
      repeat: "unlimited",
      status: "published",
      isActive: true,
    });
    expect(await finalizeMonth("2026-09")).toEqual({ challenge: 2, attendance: 0 });
    expect(await finalizeMonth("2026-09")).toEqual({ challenge: 0, attendance: 0 });
    expect((await User.findById(a1._id).lean())?.spendableBalance).toBe(25);
    expect((await User.findById(b1._id).lean())?.spendableBalance ?? 0).toBe(0);
    expect(await CoinLedger.countDocuments({ type: "quest" })).toBe(2);
  });

  it("haftalik masala natijasi bir marta e'lon qilinadi", async () => {
    const [s1, s2] = await Promise.all([student(), student()]);
    const q = await Quest.create({
      title: "Massivdagi takrorlar",
      verify: "competition",
      reward: { coinsMin: 20, coinsMax: 50, xp: null, places: [50, 30, 20] },
      audience: { groupIds: [], grades: [] },
      repeat: "weekly",
      status: "published",
      isActive: true,
    });
    await QuestSubmission.insertMany([
      { questId: q._id, studentId: s1._id, status: "approved" as const, place: 1, coins: 50, monthKey: "2026-10", periodKey: "w:2026-W42" },
      { questId: q._id, studentId: s2._id, status: "rejected" as const, monthKey: "2026-10", periodKey: "w:2026-W42" },
    ]);
    expect(await finalizeWeekly("2026-W42")).toBe(1);
    expect(await finalizeWeekly("2026-W42")).toBe(0);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(String(s1._id), "weekly_result", expect.objectContaining({ place: 1, coins: 50 }));
    expect(notify).toHaveBeenCalledWith(String(s2._id), "weekly_result", expect.objectContaining({ place: null }));
  });
});
