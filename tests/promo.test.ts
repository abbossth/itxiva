import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn(), notifyAllStudents: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Promo } = await import("@/lib/db/models/promo.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const promo = await import("@/actions/promo.actions");
const { PROMO_MAX_ACTIVE, promoPrice } = await import("@/lib/promo");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

const mkStudent = (login: string, balance = 1000) => User.create({ login, fullName: `${login} Valiyev`, role: "student", passwordHash: "x", spendableBalance: balance });
const as = (u: Parameters<typeof sessionFor>[0]) => actAs(sessionFor(u));
const input = { kind: "project", title: "Telegram bot yasadim", text: "Python'da", link: "github.com/ali/bot", emoji: "🚀", color: "violet", days: 2 };

describe("bosh sahifada e'lon", () => {
  it("coin yechiladi, ustoz tasdiqlagach bosh sahifada ko'rinadi; bir vaqtda bittadan", async () => {
    const ali = await mkStudent("ali");
    const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    as(ali);
    const r = await promo.createPromoAction(input);
    expect(r).toMatchObject({ success: true, data: { balance: 1000 - promoPrice(2) } });
    expect((await promo.createPromoAction(input)).success).toBe(false); // kutilayotgani bor
    expect(await promo.getActivePromos()).toEqual([]); // hali tasdiqlanmagan
    const p = (await Promo.findOne().lean())!;
    expect(p.link).toBe("https://github.com/ali/bot");
    as(mentor);
    expect((await promo.approvePromoAction(String(p._id))).success).toBe(true);
    as(ali);
    const active = await promo.getActivePromos();
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ title: "Telegram bot yasadim", author: "ali Valiyev", days: 2 });
  });

  it("noto'g'ri havola va yetmagan coin rad etiladi", async () => {
    const ali = await mkStudent("ali", 100);
    as(ali);
    expect(await promo.createPromoAction({ ...input, link: "javascript:alert(1)" })).toMatchObject({ success: false });
    expect(await promo.createPromoAction({ ...input, link: "" })).toMatchObject({ success: false, message: expect.stringContaining("yetarli coin") });
    expect((await User.findById(ali._id).lean())!.spendableBalance).toBe(100);
  });

  it("rad etilsa yoki bekor qilinsa coin qaytadi", async () => {
    const ali = await mkStudent("ali");
    const vali = await mkStudent("vali");
    const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    as(ali);
    await promo.createPromoAction(input);
    as(vali);
    await promo.createPromoAction({ ...input, days: 1 });
    const [pa, pv] = await Promo.find().sort({ createdAt: 1 }).lean();
    as(mentor);
    expect(await promo.rejectPromoAction(String(pa._id), "odobga to'g'ri kelmaydi")).toMatchObject({ success: true });
    expect((await User.findById(ali._id).lean())!.spendableBalance).toBe(1000);
    as(vali);
    expect((await promo.cancelPromoAction(String(pv._id))).success).toBe(true);
    expect((await User.findById(vali._id).lean())!.spendableBalance).toBe(1000);
    expect(await CoinLedger.countDocuments({ type: "adjustment" })).toBe(2);
  });

  it(`bir vaqtda ko'pi bilan ${PROMO_MAX_ACTIVE} ta: ortiqchasi navbatga turadi`, async () => {
    const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const ids: string[] = [];
    for (let i = 0; i < PROMO_MAX_ACTIVE + 1; i++) {
      const s = await mkStudent(`s${i}`);
      as(s);
      await promo.createPromoAction({ ...input, days: 1 });
      ids.push(String((await Promo.findOne({ studentId: s._id }).lean())!._id));
    }
    as(mentor);
    for (const id of ids) await promo.approvePromoAction(id);
    const last = (await Promo.findById(ids.at(-1)).lean())!;
    expect(new Date(last.startsAt!).getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(await promo.getActivePromos()).toHaveLength(PROMO_MAX_ACTIVE);
  });
});
