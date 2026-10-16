import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: () => guardsMock.getCurrentUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Limit testlar orasida to'planib qolmasligi uchun
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({
  notify: vi.fn(),
  notifyMany: vi.fn(),
  notifyMentors: vi.fn(),
  notifyGroup: vi.fn(),
  notifyAllStudents: vi.fn(),
}));

const { User } = await import("@/lib/db/models/user.model");
const { Product } = await import("@/lib/db/models/product.model");
const { Order } = await import("@/lib/db/models/order.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const shop = await import("@/actions/shop.actions");

async function seed(balance: number, product: { price: number; stock?: number | null }) {
  const student = await User.create({ login: "ali", fullName: "Ali Valiyev", role: "student", passwordHash: "x", totalCoins: 500, spendableBalance: balance });
  const mentor = await User.create({ login: "mentor", fullName: "Mentor", role: "mentor", passwordHash: "x" });
  const item = await Product.create({ title: "Daftar", price: product.price, stock: product.stock ?? null, isActive: true });
  return { student, mentor, item };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("do'kon: buyurtma berish", () => {
  it("coin yechiladi, reytingdagi jami coin o'zgarmaydi, ledger yoziladi", async () => {
    const { student, item } = await seed(100, { price: 60 });
    actAs(sessionFor(student));

    const res = await shop.createOrderAction(item._id.toString());
    expect(res.success).toBe(true);

    const after = await User.findById(student._id).lean();
    expect(after?.spendableBalance).toBe(40);
    expect(after?.totalCoins).toBe(500);
    expect(await Order.countDocuments({ studentId: student._id, status: "pending" })).toBe(1);
    const ledger = await CoinLedger.find({ studentId: student._id }).lean();
    expect(ledger.map((l) => [l.amount, l.type])).toEqual([[-60, "purchase"]]);
  });

  it("balans yetmasa rad etiladi va hech narsa o'zgarmaydi", async () => {
    const { student, item } = await seed(50, { price: 60, stock: 3 });
    actAs(sessionFor(student));

    const res = await shop.createOrderAction(item._id.toString());
    expect(res.success).toBe(false);
    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(50);
    expect((await Product.findById(item._id).lean())?.stock).toBe(3);
    expect(await Order.countDocuments()).toBe(0);
  });

  it("bir vaqtda ikki marta bosilsa ham balans minusga tushmaydi", async () => {
    const { student, item } = await seed(100, { price: 60 });
    actAs(sessionFor(student));

    const results = await Promise.all([
      shop.createOrderAction(item._id.toString()),
      shop.createOrderAction(item._id.toString()),
      shop.createOrderAction(item._id.toString()),
    ]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(40);
    expect(await Order.countDocuments()).toBe(1);
  });

  it("tanga yetsa bitta mahsulotni bir necha marta olish mumkin", async () => {
    const { student, item } = await seed(200, { price: 60 });
    actAs(sessionFor(student));

    expect((await shop.createOrderAction(item._id.toString())).success).toBe(true);
    expect((await shop.createOrderAction(item._id.toString())).success).toBe(true);
    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(80);
  });

  it("oxirgi dona uchun bir vaqtda kelgan buyurtmalardan faqat bittasi o'tadi", async () => {
    const { student, item } = await seed(1000, { price: 10, stock: 1 });
    actAs(sessionFor(student));

    const results = await Promise.all([1, 2, 3].map(() => shop.createOrderAction(item._id.toString())));
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect((await Product.findById(item._id).lean())?.stock).toBe(0);
    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(990);
  });

  it("mentor o'quvchi nomidan buyurtma bera olmaydi", async () => {
    const { mentor, item } = await seed(100, { price: 60 });
    actAs(sessionFor(mentor));
    await expect(shop.createOrderAction(item._id.toString())).rejects.toThrow(/Ruxsat berilmagan/);
  });
});

describe("do'kon: buyurtma holatlari", () => {
  it("rad etilganda coin va zaxira qaytadi; ikkinchi marta rad etib bo'lmaydi", async () => {
    const { student, mentor, item } = await seed(100, { price: 60, stock: 2 });
    actAs(sessionFor(student));
    await shop.createOrderAction(item._id.toString());
    const order = await Order.findOne({ studentId: student._id });

    actAs(sessionFor(mentor));
    expect((await shop.rejectOrderAction(order!._id.toString(), "Tugagan")).success).toBe(true);
    expect((await shop.rejectOrderAction(order!._id.toString(), "Tugagan")).success).toBe(false);

    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(100);
    expect((await Product.findById(item._id).lean())?.stock).toBe(2);
  });

  it("o'quvchi mentor amallarini bajara olmaydi", async () => {
    const { student, item } = await seed(100, { price: 60 });
    actAs(sessionFor(student));
    await shop.createOrderAction(item._id.toString());
    const order = await Order.findOne({ studentId: student._id });
    await expect(shop.acceptOrderAction(order!._id.toString())).rejects.toThrow(/Ruxsat berilmagan/);
  });

  it("to'liq yo'l: qabul -> topshirish -> o'quvchi tasdig'i", async () => {
    const { student, mentor, item } = await seed(100, { price: 60 });
    actAs(sessionFor(student));
    await shop.createOrderAction(item._id.toString());
    const id = (await Order.findOne({ studentId: student._id }))!._id.toString();

    // Qabul qilinmagan buyurtmani topshirib bo'lmaydi
    actAs(sessionFor(mentor));
    expect((await shop.handOverOrderAction(id)).success).toBe(false);
    expect((await shop.acceptOrderAction(id)).success).toBe(true);
    expect((await shop.handOverOrderAction(id)).success).toBe(true);

    actAs(sessionFor(student));
    expect((await shop.confirmReceivedAction(id)).success).toBe(true);
    expect((await Order.findById(id).lean())?.status).toBe("received");
    expect((await User.findById(student._id).lean())?.spendableBalance).toBe(40);
  });
});

describe("narx tavsiyasi va so'mdagi narx", () => {
  it("katalog nisbati, daromad bo'yicha zaxira hisob, yaxlitlash va ogohlantirish", async () => {
    const { suggestCoinPrice, niceCoins } = await import("@/lib/shop-pricing");
    expect([niceCoins(0.4), niceCoins(13.4), niceCoins(47), niceCoins(233), niceCoins(1234)]).toEqual([1, 13, 45, 230, 1250]);

    // Katalog: 1 coin ≈ 250 so'm (ikkala mahsulot ham shu nisbatda)
    const byCatalog = suggestCoinPrice({
      realPrice: 25_000,
      catalog: [
        { title: "Ruchka", price: 20, realPrice: 5_000 },
        { title: "Futbolka", price: 400, realPrice: 100_000 },
      ],
      perStudentMonthly: 200,
      monthlyTarget: 200,
    })!;
    expect(byCatalog).toMatchObject({ basis: "catalog", suggested: 100, low: 80, high: 130, somPerCoin: 250, referencesUsed: 2, warning: null });
    expect(byCatalog.weeksToEarn).toBeCloseTo(2.2, 1);
    expect(byCatalog.nearest[0].title).toBe("Ruchka");

    // Katalogda so'm narxi kam — oylik daromad ≈ 30 000 so'mlik sovg'a
    const byEconomy = suggestCoinPrice({ realPrice: 300_000, catalog: [], perStudentMonthly: 150, monthlyTarget: 200 })!;
    expect(byEconomy).toMatchObject({ basis: "economy", suggested: 1500, somPerCoin: 200 });
    expect(byEconomy.warning).toMatch(/3 oydan/);
    expect(suggestCoinPrice({ realPrice: 0, catalog: [], perStudentMonthly: 0, monthlyTarget: 200 })).toBeNull();
  });

  it("so'mdagi narx o'quvchiga yuborilmaydi; tavsiyani faqat mentor oladi", async () => {
    const { student, mentor } = await seed(100, { price: 60 });
    actAs(sessionFor(mentor));
    const saved = await shop.saveProductAction({ title: "Stiker", price: 30, realPrice: 8000, isActive: true });
    expect(saved.data?.realPrice).toBe(8000);
    // Faolligini almashtirish so'mdagi narxni o'chirmaydi
    await shop.saveProductAction({ title: "Stiker", price: 30, isActive: false }, saved.data!._id);
    expect((await Product.findById(saved.data!._id).lean())?.realPrice).toBe(8000);
    await shop.saveProductAction({ title: "Stiker", price: 30, isActive: true }, saved.data!._id);
    expect((await shop.getProducts()).find((p) => p.title === "Stiker")?.realPrice).toBe(8000);
    expect(await shop.suggestProductPriceAction({ realPrice: 16_000 })).toMatchObject({ basis: "economy" });

    actAs(sessionFor(student));
    const catalog = await shop.getProducts();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((p) => !("realPrice" in p))).toBe(true);
    await expect(shop.suggestProductPriceAction({ realPrice: 16_000 })).rejects.toThrow();
  });
});

describe("do'kon: sotib olganlar soni", () => {
  it("har o'quvchi bir marta sanaladi; rad etilgan va bekor qilinganlar sanalmaydi; o'zim olganim belgilanadi", async () => {
    const { student, mentor, item } = await seed(500, { price: 10 });
    const other = await User.create({ login: "vali", fullName: "Vali", role: "student", passwordHash: "x", spendableBalance: 500 });
    const third = await User.create({ login: "soli", fullName: "Soli", role: "student", passwordHash: "x", spendableBalance: 500 });
    const order = (studentId: typeof student._id, status: "pending" | "accepted" | "received" | "rejected" | "cancelled") =>
      Order.create({ studentId, productId: item._id, productTitle: "Daftar", price: 10, status });
    await order(student._id, "received");
    await order(student._id, "pending");
    await order(other._id, "accepted");
    await order(third._id, "rejected");
    await order(third._id, "cancelled");

    actAs(sessionFor(student));
    expect((await shop.getProducts()).find((p) => p._id === String(item._id))).toMatchObject({ buyers: 2, boughtByMe: true });
    actAs(sessionFor(third));
    expect((await shop.getProducts()).find((p) => p._id === String(item._id))).toMatchObject({ buyers: 2, boughtByMe: false });
    actAs(sessionFor(mentor));
    expect((await shop.getProducts()).find((p) => p._id === String(item._id))).toMatchObject({ buyers: 2, boughtByMe: false });
  });
});
