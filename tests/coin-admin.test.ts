import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn(), notifyAllStudents: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { AuditLog } = await import("@/lib/db/models/audit-log.model");
const { awardCoins } = await import("@/lib/gamification/award");
const admin = await import("@/actions/coin-admin.actions");
const report = await import("@/actions/report.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function seed() {
  const g = await Group.create({ name: "9.2", grade: 9 });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const mk = (login: string, coins = 100) =>
    User.create({ login, fullName: login.toUpperCase(), role: "student", groupId: g._id, passwordHash: "x", spendableBalance: coins, totalCoins: coins, xp: coins });
  return { mentor, ali: await mk("ali"), vali: await mk("vali", 5) };
}
const user = async (id: unknown) => (await User.findById(id).select("spendableBalance totalCoins xp").lean())!;

describe("mentor: coin berish", () => {
  it("bir nechta o'quvchiga coin va XP; takror yuborilsa ikkinchi marta yozilmaydi; o'quvchi qila olmaydi", async () => {
    const { mentor, ali, vali } = await seed();
    actAs(sessionFor(mentor));
    const input = { studentIds: [ali._id.toString(), vali._id.toString()], coin: 20, reason: "Faol qatnashgani uchun", requestId: "req-12345678" };
    const res = await admin.grantCoinsAction(input);
    expect(res.success && res.data.applied).toBe(2);
    expect(await user(ali._id)).toMatchObject({ spendableBalance: 120, totalCoins: 120, xp: 120 });
    // Ikki marta bosildi
    const again = await admin.grantCoinsAction(input);
    expect(again.success && again.data.applied).toBe(0);
    expect((await user(ali._id)).spendableBalance).toBe(120);
    const row = await CoinLedger.findOne({ studentId: ali._id }).lean();
    expect(row).toMatchObject({ type: "bonus", amount: 20, xp: 20, description: "Ustozdan: Faol qatnashgani uchun" });
    expect(await AuditLog.countDocuments({ action: "GRANT_COINS" })).toBe(2);

    // Faqat XP, boshqa miqdor
    await admin.grantCoinsAction({ studentIds: [ali._id.toString()], coin: 0, xp: 50, reason: "Loyiha", requestId: "req-xp-000001" });
    expect(await user(ali._id)).toMatchObject({ spendableBalance: 120, xp: 170 });

    // Olib qo'yish: balans yetmaganlar o'tkazib yuboriladi
    const take = await admin.grantCoinsAction({ studentIds: [ali._id.toString(), vali._id.toString()], coin: -30, reason: "Xato berilgan edi", requestId: "req-take-0001" });
    expect(take.success && take.data).toMatchObject({ applied: 1, skipped: ["VALI"] });
    expect(await user(ali._id)).toMatchObject({ spendableBalance: 90, xp: 170 });
    expect((await user(vali._id)).spendableBalance).toBe(25);

    // Sababsiz, juda katta, o'quvchi tomonidan — rad
    expect((await admin.grantCoinsAction({ ...input, reason: "", requestId: "req-bad-00001" })).success).toBe(false);
    expect((await admin.grantCoinsAction({ ...input, coin: 99999, requestId: "req-bad-00002" })).success).toBe(false);
    actAs(sessionFor(ali));
    expect((await admin.grantCoinsAction({ ...input, requestId: "req-bad-00003" })).success).toBe(false);
    expect((await user(ali._id)).spendableBalance).toBe(90);
  });
});

describe("mentor: xato yozuvni tuzatish", () => {
  it("jarimani bekor qilish balansni qaytaradi, yozuv qoladi va mukofot kaliti band turadi", async () => {
    const { mentor, ali } = await seed();
    await awardCoins({ studentId: ali._id, coin: -30, type: "penalty", description: "Sababsiz qoldirdi", idempotencyKey: "penalty:x:1" });
    expect((await user(ali._id)).spendableBalance).toBe(70);
    const pen = (await CoinLedger.findOne({ idempotencyKey: "penalty:x:1" }).lean())!;

    actAs(sessionFor(mentor));
    const res = await admin.editCoinEntryAction({ entryId: pen._id.toString(), coin: 0, xp: 0, reason: "Sababli edi" });
    expect(res.success).toBe(true);
    expect(await user(ali._id)).toMatchObject({ spendableBalance: 100, totalCoins: 100 });
    const after = (await CoinLedger.findById(pen._id).lean())!;
    expect(after).toMatchObject({ amount: 0, xp: 0 });
    expect(after.voidedAt).toBeTruthy();
    expect(after.edits?.[0]).toMatchObject({ fromCoin: -30, toCoin: 0, reason: "Sababli edi" });
    // Tizim shu jarimani qayta yozmaydi
    const re = await awardCoins({ studentId: ali._id, coin: -30, type: "penalty", description: "Sababsiz qoldirdi", idempotencyKey: "penalty:x:1" });
    expect(re.ok && re.applied).toBe(false);
    expect((await user(ali._id)).spendableBalance).toBe(100);
    expect(await AuditLog.countDocuments({ action: "VOID_COIN_ENTRY" })).toBe(1);

    // Hisobotda: bekor qilingan, asl qiymati bilan
    const r = await report.getStudentReport(ali._id.toString());
    expect(r?.ledger.find((l) => l.id === pen._id.toString())).toMatchObject({ voided: true, edit: { fromCoin: -30, reason: "Sababli edi" } });
  });

  it("mukofot summasini o'zgartirish: farq qo'shiladi/ayiriladi; sarflangan coinni olib bo'lmaydi; xarid qulflangan", async () => {
    const { mentor, ali } = await seed();
    await awardCoins({ studentId: ali._id, coin: 50, type: "quest", description: "Topshiriq" });
    const q = (await CoinLedger.findOne({ type: "quest" }).lean())!;
    expect(await user(ali._id)).toMatchObject({ spendableBalance: 150, xp: 150 });

    actAs(sessionFor(mentor));
    // 50 o'rniga 10 bo'lishi kerak edi
    expect((await admin.editCoinEntryAction({ entryId: q._id.toString(), coin: 10, xp: 10, reason: "Xato summa" })).success).toBe(true);
    expect(await user(ali._id)).toMatchObject({ spendableBalance: 110, totalCoins: 110, xp: 110 });
    // Ikkinchi tuzatish ham ishlaydi
    expect((await admin.editCoinEntryAction({ entryId: q._id.toString(), coin: 30, xp: 10, reason: "Aslida 30" })).success).toBe(true);
    expect(await user(ali._id)).toMatchObject({ spendableBalance: 130, xp: 110 });

    // O'quvchi coinlarni sarflab qo'ygan: olib bo'lmaydi, yozuv o'zgarmaydi
    await User.updateOne({ _id: ali._id }, { $set: { spendableBalance: 5 } });
    const no = await admin.editCoinEntryAction({ entryId: q._id.toString(), coin: 0, xp: 0, reason: "Bekor" });
    expect(no.success).toBe(false);
    expect((await CoinLedger.findById(q._id).lean())).toMatchObject({ amount: 30, xp: 10 });
    expect((await CoinLedger.findById(q._id).lean())?.edits).toHaveLength(2);
    expect((await user(ali._id)).spendableBalance).toBe(5);

    await awardCoins({ studentId: ali._id, coin: -5, xp: 0, type: "purchase", description: "Bloknot" });
    const buy = (await CoinLedger.findOne({ type: "purchase" }).lean())!;
    expect((await admin.editCoinEntryAction({ entryId: buy._id.toString(), coin: 0, xp: 0, reason: "Qaytarish" })).success).toBe(false);
  });
});
