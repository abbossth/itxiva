import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { Order } = await import("@/lib/db/models/order.model");
const { toDateKey, addDaysToKey } = await import("@/lib/schedule");
const report = await import("@/actions/report.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("Hisobot (davr bo'yicha)", () => {
  it("coinlar baza ichida jamlanadi: topilgan, sarflangan, turlar va eng ko'p topganlar; guruh filtri ishlaydi", async () => {
    const mentor = await User.create({ login: "u", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const [g1, g2] = await Group.create([{ name: "8-A", grade: 8 }, { name: "9-B", grade: 9 }]);
    const ali = await User.create({ login: "ali", fullName: "Ali", role: "student", passwordHash: "x", groupId: g1._id });
    const vali = await User.create({ login: "vali", fullName: "Vali", role: "student", passwordHash: "x", groupId: g2._id });
    const old = new Date(Date.now() - 90 * 86_400_000);
    const row = (studentId: mongoose.Types.ObjectId, amount: number, type: string, createdAt?: Date) => ({ studentId, amount, type, description: "t", ...(createdAt ? { createdAt } : {}) });
    await CoinLedger.create([
      row(ali._id, 10, "attendance"),
      row(ali._id, 20, "homework"),
      row(ali._id, -15, "purchase"),
      row(ali._id, 15, "adjustment"), // xarid qaytarildi — topilgan emas
      row(ali._id, -5, "adjustment"), // jarima/tuzatish — hisobga kiradi
      row(ali._id, 999, "xp_align"), // hisobga kirmaydi
      row(vali._id, 7, "attendance"),
      row(vali._id, 100, "attendance", old), // davrdan tashqari
    ] as never[]);
    const pid = new mongoose.Types.ObjectId();
    await Order.create([
      { studentId: ali._id, productId: pid, productTitle: "Ruchka", price: 15, status: "pending" },
      { studentId: vali._id, productId: pid, productTitle: "Ruchka", price: 15, status: "rejected" },
    ]);

    actAs(sessionFor(mentor));
    const to = toDateKey();
    const from = addDaysToKey(to, -29);
    const all = (await report.getReportData({ from, to }))!;
    expect(all.overview).toMatchObject({ coinsEarned: 10 + 20 - 5 + 7, coinsSpent: 15, pendingOrders: 1 });
    const byType = Object.fromEntries(all.coinsByType.map((c) => [c.type, c.amount]));
    expect(byType).toMatchObject({ attendance: 17, homework: 20, purchase: -15, adjustment: 10 });
    expect(byType.xp_align).toBeUndefined();
    expect(all.topEarners[0]).toMatchObject({ fullName: "Ali", earned: 25, groupName: "8-A" });
    expect(all.topProducts).toEqual([{ title: "Ruchka", count: 1, coins: 15 }]);

    const only = (await report.getReportData({ from, to, groupId: String(g2._id) }))!;
    expect(only.overview).toMatchObject({ coinsEarned: 7, coinsSpent: 0, pendingOrders: 0 });
    expect(only.topEarners.map((t) => t.fullName)).toEqual(["Vali"]);
  });
});
