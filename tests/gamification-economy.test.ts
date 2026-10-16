import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 9, resetInSeconds: 1 }) }));
const notifyMentors = vi.fn();
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: (...a: unknown[]) => notifyMentors(...a), notifyGroup: vi.fn(), notifyAllStudents: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Product } = await import("@/lib/db/models/product.model");
const { Order } = await import("@/lib/db/models/order.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const shop = await import("@/actions/shop.actions");
const economy = await import("@/actions/economy.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  notifyMentors.mockClear();
});

async function seed(enabled = true) {
  await AppSettings.create({ key: "global", gamification: { enabled, monthlyCoinTarget: 200 } });
  const g = await Group.create({ name: "9.2", grade: 9, academicYear: "2026-2027" });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const ali = await User.create({ login: "ali", fullName: "Ali", role: "student", groupId: g._id, passwordHash: "x", spendableBalance: 100, totalCoins: 100, xp: 100 });
  const shield = await Product.create({ title: "Seriya himoyasi", price: 30, kind: "streak_shield" });
  const notebook = await Product.create({ title: "Bloknot", price: 300 });
  return { mentor, ali, shield, notebook };
}

describe("seriya himoyasi", () => {
  it("darhol beriladi (mentor tasdig'isiz), XP va reyting kamaymaydi, ko'pi bilan 2 ta", async () => {
    const { ali, shield } = await seed();
    actAs(sessionFor(ali));
    expect((await shop.createOrderAction(String(shield._id))).success).toBe(true);
    expect((await shop.createOrderAction(String(shield._id))).success).toBe(true);
    expect((await shop.createOrderAction(String(shield._id))).message).toMatch(/2 ta himoya/);
    expect(await User.findById(ali._id).lean()).toMatchObject({ streakShields: 2, spendableBalance: 40, totalCoins: 100, xp: 100 });
    expect(await Order.countDocuments({ status: "received" })).toBe(2);
    expect(notifyMentors).not.toHaveBeenCalled();
  });

  it("gamifikatsiya o'chiq bo'lsa ko'rinmaydi va sotib olinmaydi", async () => {
    const { ali, shield } = await seed(false);
    actAs(sessionFor(ali));
    expect((await shop.getProducts()).map((p) => p.title)).toEqual(["Bloknot"]);
    expect((await shop.createOrderAction(String(shield._id))).success).toBe(false);
  });
});

describe("coin iqtisodiyoti", () => {
  it("o'quvchi boshiga oylik daromad, manbalar va ogohlantirish", async () => {
    const { mentor, ali } = await seed();
    await CoinLedger.insertMany([
      { studentId: ali._id, amount: 20, type: "attendance", description: "a", createdAt: new Date() },
      { studentId: ali._id, amount: 3, type: "homework", description: "h", createdAt: new Date() },
      { studentId: ali._id, amount: -5, type: "adjustment", description: "jarima", createdAt: new Date() },
      { studentId: ali._id, amount: -30, type: "purchase", description: "xarid", createdAt: new Date() },
    ]);
    actAs(sessionFor(mentor));
    const e = await economy.getCoinEconomy(30);
    expect(e).toMatchObject({ given: 23, perStudentMonthly: 23, spent: 30, topEarner: 23, cheapest: { title: "Bloknot", price: 300 }, warning: true });
    expect(e.sources.map((s) => [s.type, s.amount])).toEqual([["attendance", 20], ["homework", 3]]);
    // Reja bilan: 300 / 200 = 1,5 oy
    expect(e.products.find((p) => p.title === "Bloknot")?.monthsPlan).toBe(1.5);
    actAs(sessionFor(ali));
    await expect(economy.getCoinEconomy(30)).rejects.toThrow();
  });
});
