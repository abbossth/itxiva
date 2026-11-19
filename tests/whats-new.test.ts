import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);

const { User } = await import("@/lib/db/models/user.model");
const { NEWS, pendingNews } = await import("@/lib/whats-new");
const news = await import("@/actions/news.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("Yangilik e'lonlari", () => {
  it("har bir yozuvning id si yagona, slaydlari bor; o'quvchi va mentor uchun alohida", () => {
    expect(new Set(NEWS.map((n) => n.id)).size).toBe(NEWS.length);
    for (const n of NEWS) expect(n.slides.length).toBeGreaterThan(0);
    expect(pendingNews([], "student")?.audience).toBe("student");
    expect(pendingNews([], "mentor")?.audience).toBe("mentor");
  });

  it("mentorga — mentor yangiligi, o'quvchiga — o'quvchiniki; ko'rilgani qayta chiqmaydi, boshqa rolniki belgilanmaydi", async () => {
    const mentor = await User.create({ login: "u", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const ali = await User.create({ login: "ali", fullName: "Ali", role: "student", passwordHash: "x" });
    actAs(sessionFor(mentor));
    const m = await news.getPendingNewsAction();
    expect(m?.item.audience).toBe("mentor");
    const studentItem = NEWS.find((n) => n.audience === "student")!;
    await news.markNewsSeenAction(studentItem.id);
    expect((await User.findById(mentor._id).lean())?.seenNews).toEqual([]);
    await news.markNewsSeenAction(m!.item.id);
    expect((await news.getPendingNewsAction())?.item.id).not.toBe(m!.item.id);

    actAs(sessionFor(ali));
    expect((await news.getPendingNewsAction())?.item.audience).toBe("student");
  });
});
