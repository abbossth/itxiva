import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/storage/r2", () => ({ getDownloadPresignedUrl: async () => "https://files.test/x" }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const { AttendanceSession } = await import("@/lib/db/models/attendance-session.model");
const { AttendanceRecord } = await import("@/lib/db/models/attendance-record.model");
const rewards = await import("@/actions/rewards.actions");
const profile = await import("@/actions/student-profile.actions");
const dashboard = await import("@/actions/dashboard.actions");
const leaderboard = await import("@/actions/leaderboard.actions");
const { Product } = await import("@/lib/db/models/product.model");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const ago = (ms: number) => new Date(Date.now() - ms);

async function seed() {
  const group = await Group.create({ name: "8.2", grade: 8, academicYear: "2026-2027" });
  const make = (login: string, xp: number, extra: Record<string, unknown> = {}) =>
    User.create({ login, fullName: login.toUpperCase(), role: "student", groupId: group._id, passwordHash: "x", xp, totalCoins: xp, ...extra });
  const me = await make("ali", 120, { spendableBalance: 40 });
  await make("vali", 300);
  await make("soli", 200);
  await make("gani", 120);
  await make("hidden", 999, { isHiddenFromLeaderboard: true });
  return { group, me };
}

describe("mukofot tabrigi", () => {
  it("birinchi marta hisob boshlanadi; keyin faqat yangi daromadlar; tasdiqlangach qayta chiqmaydi", async () => {
    const { me } = await seed();
    await AppSettings.create({ key: "global", gamification: { enabled: true } });
    actAs(sessionFor(me));
    await CoinLedger.create({ studentId: me._id, amount: 50, xp: 50, type: "homework", description: "eski", createdAt: ago(60_000) });

    // Birinchi chaqiruv: eski tarix ko'rsatilmaydi
    expect(await rewards.getUnseenRewardsAction()).toBeNull();
    expect((await User.findById(me._id).lean())?.rewardsSeenAt).toBeInstanceOf(Date);

    await CoinLedger.create([
      { studentId: me._id, amount: 5, xp: 5, type: "attendance", description: "Darsga keldi" },
      { studentId: me._id, amount: 2, xp: 2, type: "quiz", description: "Test" },
      { studentId: me._id, amount: 1, xp: 1, type: "quiz", description: "Test" },
      // Mukofot emas
      { studentId: me._id, amount: -30, xp: 0, type: "purchase", description: "Xarid" },
      { studentId: me._id, amount: -5, xp: 0, type: "adjustment", description: "Jarima" },
      { studentId: me._id, amount: 0, xp: 70, type: "xp_align", description: "tenglashtirish" },
      { studentId: me._id, amount: 50, xp: 0, type: "level", description: "Daraja bonusi" },
    ]);
    const r = await rewards.getUnseenRewardsAction();
    expect(r).toMatchObject({ coins: 8, xp: 8, balance: 40, effects: true });
    expect(r!.items.map((i) => [i.type, i.coins, i.count])).toEqual([
      ["attendance", 5, 1],
      ["quiz", 3, 2],
    ]);
    expect(r!.level).toMatchObject({ level: 2, toNext: 130 });

    await rewards.acknowledgeRewardsAction(r!.until);
    expect(await rewards.getUnseenRewardsAction()).toBeNull();

    // Kelajakdagi sana bilan keyingi mukofotlarni yashirib bo'lmaydi
    await rewards.acknowledgeRewardsAction(new Date(Date.now() + 3_600_000).toISOString());
    await CoinLedger.create({ studentId: me._id, amount: 10, xp: 10, type: "quest", description: "Topshiriq" });
    expect((await rewards.getUnseenRewardsAction())?.coins).toBe(10);
  });

  it("gamifikatsiya o'chiq bo'lsa XP ko'rsatilmaydi; mentor uchun hech narsa", async () => {
    const { me } = await seed();
    await User.updateOne({ _id: me._id }, { $set: { rewardsSeenAt: ago(1000), celebrationsEnabled: false } });
    await CoinLedger.create({ studentId: me._id, amount: 5, xp: 5, type: "attendance", description: "Keldi" });
    actAs(sessionFor(me));
    expect(await rewards.getUnseenRewardsAction()).toMatchObject({ coins: 5, xp: 0, level: null, effects: false });

    const mentor = await User.create({ login: "m", fullName: "M", role: "mentor", passwordHash: "x" });
    actAs(sessionFor(mentor));
    expect(await rewards.getUnseenRewardsAction()).toBeNull();
  });
});

describe("o'quvchining o'z profili", () => {
  it("guruh, o'rin (yashirilganlarsiz, tenglar bir xil o'rinda), XP tarixi; mentor izohi ko'rinmaydi", async () => {
    const { group, me } = await seed();
    await AppSettings.create({ key: "global", gamification: { enabled: true } });
    await CoinLedger.create([
      { studentId: me._id, amount: 0, xp: 100, type: "xp_align", description: "x" },
      { studentId: me._id, amount: 20, xp: 20, type: "homework", description: "Vazifa" },
    ]);
    const mentor0 = await User.create({ login: "m0", fullName: "M0", role: "mentor", passwordHash: "x" });
    const s = await AttendanceSession.create({ groupId: group._id, mentorId: mentor0._id, date: new Date(), startTime: new Date(), status: "closed", currentCode: "ABC123", currentToken: "t1" });
    await AttendanceRecord.create({ sessionId: s._id, groupId: group._id, studentId: me._id, status: "absent", notes: "telefon o'ynadi" });

    actAs(sessionFor(me));
    const data = await profile.getMyProfile();
    expect(data?.unit).toBe("XP");
    expect(data?.group).toMatchObject({ name: "8.2", students: 4, myRank: 3 });
    expect(data?.group?.top.map((t) => [t.name, t.rank, t.isMe])).toEqual([
      ["VALI", 1, false],
      ["SOLI", 2, false],
      ["ALI", 3, true],
    ]);
    expect(data?.gamification).toMatchObject({ level: 2, xp: 120 });
    expect(data?.report.xpHistory.map((x) => [x.type, x.xp]).sort()).toEqual([
      ["homework", 20],
      ["xp_align", 100],
    ]);
    expect(data?.report.attendance.records[0]).toMatchObject({ status: "absent", notes: "" });

    // Mentor bu funksiyani chaqira olmaydi
    const mentor = await User.create({ login: "m", fullName: "M", role: "mentor", passwordHash: "x" });
    actAs(sessionFor(mentor));
    await expect(profile.getMyProfile()).rejects.toThrow();
  });
});

describe("bosh sahifa statistikasi", () => {
  it("14 kun, manbalar, keyingi sovg'a va reytingdagi farq", async () => {
    const { me } = await seed();
    await AppSettings.create({ key: "global", gamification: { enabled: true } });
    await CoinLedger.create([
      { studentId: me._id, amount: 5, xp: 5, type: "attendance", description: "Keldi" },
      { studentId: me._id, amount: 3, xp: 3, type: "quiz", description: "Test" },
      { studentId: me._id, amount: -20, xp: 0, type: "purchase", description: "Xarid" },
      { studentId: me._id, amount: 0, xp: 50, type: "xp_align", description: "x" },
      { studentId: me._id, amount: 4, xp: 4, type: "quest", description: "Eski", createdAt: ago(40 * 86_400_000) },
    ]);
    await Product.create([
      { title: "Stiker", price: 30, isActive: true },
      { title: "Ruchka", price: 60, isActive: true },
      { title: "Himoya", price: 45, isActive: true, kind: "streak_shield" },
    ]);
    actAs(sessionFor(me));
    const s = await dashboard.getStudentHomeStats();
    expect(s.unit).toBe("XP");
    expect(s.days).toHaveLength(14);
    expect(s.days[13]).toMatchObject({ xp: 8, coins: 8 });
    expect(s.days.slice(0, 13).every((d) => d.xp === 0)).toBe(true);
    expect(s.sources).toEqual([
      { type: "attendance", amount: 5 },
      { type: "quiz", amount: 3 },
    ]);
    // Balans 40: Stiker (30) yetadi, keyingisi — Ruchka; seriya himoyasi maqsad emas
    expect(s.shopGoal).toEqual({ title: "Ruchka", price: 60, balance: 40 });
    // ali 120 XP: vali 300, soli 200 oldinda; gani teng (120) — oldinda emas
    expect(s.rankGap).toEqual({ position: 3, total: 4, gap: 81, aheadName: "SOLI" });
  });
});

describe("reyting o'lchovi", () => {
  it("sukutda XP, metric=coin — jami coin bo'yicha; gamifikatsiya o'chiq bo'lsa doim coin", async () => {
    const { me } = await seed();
    // ali: XP 120, lekin coin eng ko'p
    await User.updateOne({ _id: me._id }, { $set: { totalCoins: 900 } });
    await AppSettings.create({ key: "global", gamification: { enabled: true } });
    actAs(sessionFor(me));
    const byXp = await leaderboard.getLeaderboardAction({ type: "all" });
    expect(byXp).toMatchObject({ unit: "XP", canSwitch: true });
    expect(byXp.top3[0].displayName).toBe("VALI");
    const byCoin = await leaderboard.getLeaderboardAction({ type: "all", metric: "coin" });
    expect(byCoin.unit).toBe("coin");
    expect(byCoin.top3[0]).toMatchObject({ displayName: "ALI", totalCoins: 900 });

    await AppSettings.updateOne({ key: "global" }, { $set: { "gamification.enabled": false } });
    expect(await leaderboard.getLeaderboardAction({ type: "all" })).toMatchObject({ unit: "coin", canSwitch: false });
  });
});
