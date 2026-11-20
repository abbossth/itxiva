import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn(), notifyAllStudents: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const cat = await import("@/lib/character/catalog");
const act = await import("@/actions/character.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);
afterEach(() => vi.restoreAllMocks());

async function student(level = 1, balance = 0) {
  const u = await User.create({ login: `s${Math.random()}`, fullName: "Ali Valiyev", role: "student", passwordHash: "x", level, spendableBalance: balance });
  actAs(sessionFor(u));
  return u;
}

describe("katalog", () => {
  it("standart ko'rinish bepul; noma'lum, egalikda bo'lmagan yoki darajasi yetmagan qism standartga qaytadi", () => {
    for (const slot of cat.CHAR_SLOTS) {
      const it = cat.charItem(slot, cat.DEFAULT_LOOK[slot]);
      expect(it?.price).toBe(0);
      expect(it?.level).toBe(1);
    }
    const look = cat.cleanLook({ head: "crown", outfit: "hoodie", eyes: "nope", hair: "long", power: 3, color: 99 }, [], 2, 1);
    expect(look).toMatchObject({ head: "none", outfit: "tee", eyes: "dot", hair: "long", power: 1, color: 0 });
    // Sovg'a qilingan (ro'yxatda) — darajadan qat'i nazar kiyiladi
    expect(cat.cleanLook({ head: "crown" }, ["head:crown"], 1, 0).head).toBe("crown");
    // Sovg'a: egalikdagilar qayta tushmaydi
    const owned = cat.CHAR_ITEMS.filter((i) => i.price > 0).map(cat.itemKey);
    expect(cat.pickGiftItem(owned.slice(1), 0.5)).toEqual(cat.CHAR_ITEMS.filter((i) => i.price > 0)[0]);
    expect(cat.pickGiftItem(owned)).toBeNull();
    expect(cat.POWER_STEPS).toHaveLength(cat.MAX_POWER);
  });
});

describe("amallar", () => {
  it("saqlash, sotib olish (coin yechiladi, bir marta), daraja talabi, kuch upgrade", async () => {
    const u = await student(3, 200);
    const first = await act.getMyCharacter();
    expect(first?.fresh).toBe(true);
    // Sotib olinmagan qismni kiyib bo'lmaydi
    let r = await act.saveCharacterAction({ ...first!.look, head: "cap", hair: "bun" });
    expect(r.success && r.data?.look).toMatchObject({ head: "none", hair: "bun" });
    // Daraja yetmaydi
    expect((await act.buyCharacterItemAction("head", "crown")).success).toBe(false);
    // Sotib olish
    r = await act.buyCharacterItemAction("head", "cap");
    expect(r.success && r.data?.balance).toBe(198);
    expect(r.success && r.data?.owned).toContain("head:cap");
    // Qayta bosish — ikkinchi marta yechilmaydi
    await act.buyCharacterItemAction("head", "cap");
    expect((await User.findById(u._id).lean())?.spendableBalance).toBe(198);
    expect(await CoinLedger.countDocuments({ studentId: u._id, type: "purchase" })).toBe(1);
    r = await act.saveCharacterAction({ ...first!.look, head: "cap" });
    expect(r.success && r.data?.look.head).toBe("cap");
    // Kuch: 1-bosqich (50), 2-bosqich 3-darajada (100)
    r = await act.upgradeCharacterPowerAction();
    expect(r.success && r.data).toMatchObject({ power: 1, balance: 148 });
    r = await act.upgradeCharacterPowerAction();
    expect(r.success && r.data).toMatchObject({ power: 2, balance: 48 });
    // 3-bosqich 5-darajada
    expect((await act.upgradeCharacterPowerAction()).success).toBe(false);
    expect((await act.getMyCharacter())?.look.power).toBe(2);
  });

  it("coin yetmasa — sotib olinmaydi", async () => {
    await student(5, 10);
    const r = await act.buyCharacterItemAction("outfit", "armor");
    expect(r.success).toBe(false);
    expect((await act.getMyCharacter())?.owned).toEqual([]);
  });
});
