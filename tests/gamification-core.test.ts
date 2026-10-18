import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, startDb, stopDb } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const notify = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({ notify: (...a: unknown[]) => notify(...a), notifyMany: vi.fn(), notifyMentors: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { LevelReward } = await import("@/lib/db/models/level-reward.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const { awardCoins, syncLevel } = await import("@/lib/gamification/award");
const { backfillXp, alignXpToCoins } = await import("@/lib/gamification/backfill");
const { buildLevels, levelForXp, levelProgress, DEFAULT_LEVEL_THRESHOLDS } = await import("@/lib/gamification/levels");
const { parseGamification } = await import("@/lib/gamification/config");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  notify.mockClear();
});

const student = (extra: Record<string, unknown> = {}) =>
  User.create({ login: `s${Math.random().toString(36).slice(2, 8)}`, fullName: "Ali", role: "student", passwordHash: "x", ...extra });
const enable = (extra: Record<string, unknown> = {}) =>
  AppSettings.create({ key: "global", gamification: { enabled: true, ...extra } });

describe("darajalar", () => {
  it("chegaralarda to'g'ri daraja; progress keyingi darajagacha", () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(4999).level).toBe(9);
    expect(levelForXp(5000)).toMatchObject({ level: 10, name: "Xorazmiy Vorisi" });
    expect(levelProgress(640)).toMatchObject({ current: { level: 4 }, next: { level: 5 }, toNext: 260, percent: 35 });
    expect(levelProgress(9000)).toMatchObject({ next: null, percent: 100, toNext: 0 });
  });

  it("noto'g'ri chegaralar standartga qaytadi; sozlama tekshiriladi", () => {
    expect(buildLevels([0, 50, 40, 60, 70, 80, 90, 100, 110, 120]).map((l) => l.minXp)).toEqual(DEFAULT_LEVEL_THRESHOLDS);
    expect(buildLevels([0, 10, 20, 30, 40, 50, 60, 70, 80, 90])[9].minXp).toBe(90);
    expect(parseGamification({ enabled: "yes", levelUpBonus: -5, quizDailyCap: 30 })).toMatchObject({ enabled: false, levelUpBonus: 50, quizDailyCap: 30 });
  });
});

describe("coin va XP berish", () => {
  it("bir xil kalit bilan ikki marta (parallel ham) — bir marta beriladi", async () => {
    const s = await student();
    const award = () => awardCoins({ studentId: s._id, coin: 10, type: "quest", description: "Test", idempotencyKey: "quest:1" });
    const results = await Promise.all([award(), award(), award()]);
    expect(results.filter((r) => r.ok && r.applied)).toHaveLength(1);
    const u = await User.findById(s._id).lean();
    expect(u).toMatchObject({ spendableBalance: 10, totalCoins: 10, xp: 10 });
    expect(await CoinLedger.countDocuments({ studentId: s._id })).toBe(1);
  });

  it("xarid XP ni kamaytirmaydi; balansdan ko'p yechib bo'lmaydi", async () => {
    const s = await student({ spendableBalance: 20, totalCoins: 20, xp: 20 });
    expect(await awardCoins({ studentId: s._id, coin: -30, xp: 0, type: "purchase", description: "Xarid" })).toEqual({ ok: false, reason: "insufficient" });
    expect(await CoinLedger.countDocuments()).toBe(0);
    expect((await awardCoins({ studentId: s._id, coin: -15, xp: 0, type: "purchase", description: "Xarid" })).ok).toBe(true);
    expect(await User.findById(s._id).lean()).toMatchObject({ spendableBalance: 5, totalCoins: 20, xp: 20 });
  });
});

describe("daraja bonusi", () => {
  it("gamifikatsiya o'chiq bo'lsa daraja oshmaydi", async () => {
    const s = await student();
    await awardCoins({ studentId: s._id, coin: 150, type: "bonus", description: "B" });
    expect((await User.findById(s._id).lean())?.level).toBe(1);
  });

  it("bir necha daraja oshganda har biriga bir marta bonus; qayta chaqiruv hech narsa bermaydi", async () => {
    await enable({ levelUpBonus: 50 });
    const s = await student();
    await awardCoins({ studentId: s._id, coin: 260, type: "quest", description: "Katta mukofot" });

    const u = await User.findById(s._id).lean();
    // 260 XP → 3-daraja (2 va 3 uchun bonus); bonus XP bermaydi
    expect(u).toMatchObject({ level: 3, pendingLevelUp: 3, xp: 260, spendableBalance: 360 });
    expect(await LevelReward.countDocuments({ studentId: s._id })).toBe(2);
    expect(notify).toHaveBeenCalledWith(s._id, "level_up", { level: 3, name: "Bag Qiruvchi", bonus: 100 });

    await Promise.all([syncLevel(s._id), syncLevel(s._id)]);
    expect((await User.findById(s._id).lean())?.spendableBalance).toBe(360);
    expect(await CoinLedger.countDocuments({ studentId: s._id, type: "level" })).toBe(2);
  });
});

describe("XP backfill", () => {
  it("dry-run hech narsa yozmaydi; yozish idempotent; jarima va xarid XP ga kirmaydi", async () => {
    const s = await student({ level: 1 });
    await CoinLedger.collection.insertMany([
      { studentId: s._id, amount: 80, type: "attendance", description: "a", createdAt: new Date() },
      { studentId: s._id, amount: 50, type: "homework", description: "h", createdAt: new Date() },
      { studentId: s._id, amount: -10, type: "homework", description: "qayta baho", createdAt: new Date() },
      { studentId: s._id, amount: -5, type: "adjustment", description: "jarima", createdAt: new Date() },
      { studentId: s._id, amount: -40, type: "purchase", description: "xarid", createdAt: new Date() },
      // Gamifikatsiyadan keyingi yozuv: o'zining xp qiymati olinadi
      { studentId: s._id, amount: 2, xp: 2, type: "login", description: "kirish", createdAt: new Date() },
    ]);

    const dry = await backfillXp({ dryRun: true });
    expect(dry.changes).toEqual([{ studentId: String(s._id), fullName: "Ali", xpFrom: 0, xpTo: 122, levelFrom: 1, levelTo: 2 }]);
    expect((await User.findById(s._id).lean())?.xp).toBe(0);

    await backfillXp({ dryRun: false });
    expect(await User.findById(s._id).lean()).toMatchObject({ xp: 122, level: 2, pendingLevelUp: null });
    expect((await backfillXp({ dryRun: false })).changes).toHaveLength(0);
    // Backfill daraja bonusini bermaydi
    expect(await LevelReward.countDocuments()).toBe(0);
  });

  it("XP oldingi reytingga (totalCoins) tenglashtiriladi: o'rinlar saqlanadi, bir marta, daraja pasaymaydi", async () => {
    // A: jarimalar tufayli coin XP dan kam; B: mentor tuzatishi tufayli coin XP dan ko'p
    const a = await student({ fullName: "A", totalCoins: 200 });
    const b = await student({ fullName: "B", totalCoins: 220 });
    await CoinLedger.collection.insertMany([
      { studentId: a._id, amount: 250, type: "attendance", description: "a", createdAt: new Date() },
      { studentId: a._id, amount: -50, type: "adjustment", description: "jarima", createdAt: new Date() },
      { studentId: b._id, amount: 180, type: "attendance", description: "a", createdAt: new Date() },
      { studentId: b._id, amount: 40, type: "adjustment", description: "tuzatish", createdAt: new Date() },
    ]);
    await backfillXp({ dryRun: false });
    expect(await User.findById(a._id).lean()).toMatchObject({ xp: 250, level: 3 });

    const dry = await alignXpToCoins({ dryRun: true });
    expect(dry.changes.map((c) => [c.fullName, c.xpFrom, c.xpTo]).sort()).toEqual([["A", 250, 200], ["B", 180, 220]]);
    expect((await User.findById(a._id).lean())?.xp).toBe(250);

    await alignXpToCoins({ dryRun: false });
    expect(await User.findById(a._id).lean()).toMatchObject({ xp: 200, level: 3 });
    expect(await User.findById(b._id).lean()).toMatchObject({ xp: 220, level: 2 });
    expect(await CoinLedger.find({ type: "xp_align" }).sort({ xp: 1 }).lean()).toMatchObject([
      { studentId: a._id, amount: 0, xp: -50 },
      { studentId: b._id, amount: 0, xp: 40 },
    ]);

    // Qayta ishga tushirish va ledger'dan qayta hisoblash natijani o'zgartirmaydi
    await User.updateOne({ _id: b._id }, { $inc: { totalCoins: 10 } });
    expect((await alignXpToCoins({ dryRun: false })).changes).toHaveLength(0);
    expect((await backfillXp({ dryRun: true })).changes).toHaveLength(0);
    expect(await LevelReward.countDocuments()).toBe(0);
  });
});
