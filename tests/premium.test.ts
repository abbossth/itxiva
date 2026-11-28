import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyUser: vi.fn(), notify: vi.fn(), sendNotifications: vi.fn(), notifyGroup: vi.fn(), notifyAllStudents: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => 1), pushPublicKey: () => null }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const premium = await import("@/actions/premium.actions");
const chat = await import("@/actions/chat.actions");
const core = await import("@/lib/chat/core");
const lib = await import("@/lib/premium");
const media = await import("@/lib/chat/media-catalog");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function seed(balance = 400) {
  const g = await Group.create({ name: "XSH-25I0802", grade: 8 });
  const ali = await User.create({ login: "ali", fullName: "Ali Valiyev", role: "student", passwordHash: "x", groupId: g._id, spendableBalance: balance });
  const vali = await User.create({ login: "vali", fullName: "Vali Karimov", role: "student", passwordHash: "x", groupId: g._id, spendableBalance: 0 });
  const v = (u: typeof ali) => ({ userId: String(u._id), role: u.role, groupId: u.groupId ? String(u.groupId) : null, fullName: u.fullName });
  return { ali, vali, v };
}
const as = (u: Parameters<typeof sessionFor>[0]) => actAs(sessionFor(u));

describe("IT Xiva Premium", () => {
  it("150 coin evaziga 30 kun; qayta olinsa muddati uzayadi; coin yetmasa — olinmaydi", async () => {
    const { ali, vali } = await seed(400);
    as(ali);
    const first = await premium.buyPremiumAction();
    expect(first.success && first.data).toMatchObject({ active: true, daysLeft: 30, balance: 250 });
    // keyingi 10 soniyalik oynada takroriy bosish bir marta yechiladi — vaqtni siljitamiz
    vi.useFakeTimers({ now: Date.now() + 20_000, toFake: ["Date"] });
    const second = await premium.buyPremiumAction();
    vi.useRealTimers();
    expect(second.success && second.data).toMatchObject({ active: true, balance: 100 });
    expect(second.success && second.data?.daysLeft).toBeGreaterThanOrEqual(60);
    as(vali);
    expect(await premium.buyPremiumAction()).toMatchObject({ success: false });
    expect((await User.findById(vali._id).lean())?.premiumUntil ?? null).toBeNull();
  });

  it("uslubni faqat Premium tanlaydi va u chatda yuboruvchida ko'rinadi", async () => {
    const { ali, vali, v } = await seed(400);
    as(vali);
    expect(await premium.setPremiumStyleAction({ font: "lobster" })).toMatchObject({ success: false });
    as(ali);
    await premium.buyPremiumAction();
    const r = await premium.setPremiumStyleAction({ font: "lobster", badge: "🐉", bubble: "ocean" });
    expect(r.success && r.data?.style).toEqual({ font: "lobster", badge: "🐉", bubble: "ocean" });
    // noma'lum qiymatlar saqlanmaydi
    const bad = await premium.setPremiumStyleAction({ font: "comic-sans" as string });
    expect(bad.success && bad.data?.style.font).toBe("lobster");
    const general = (await core.listRooms(v(ali)))[0];
    const sent = await chat.sendChatMessageAction(general.id, "salom");
    expect(sent.success && sent.data.senderStyle).toEqual({ font: "lobster", badge: "🐉", bubble: "ocean" });
    as(vali);
    const mine = await chat.sendChatMessageAction(general.id, "va alaykum");
    expect(mine.success && mine.data.senderStyle).toBeNull();
    const list = await core.loadMessages(general.id, {});
    expect(list.filter((m) => !m.news).map((m) => Boolean(m.senderStyle))).toEqual([true, false]);
  });
});

describe("chat: animatsiyali stikerlar, GIF va mashhurlar", () => {
  it("premium stiker va premium GIF faqat Premiumga; oddiy GIF hammaga; mashhurlar sanaladi", async () => {
    const { ali, vali, v } = await seed(400);
    const general = (await core.listRooms(v(ali)))[0];
    as(vali);
    expect(await chat.sendChatStickerAction(general.id, "a:fire")).toMatchObject({ success: false });
    expect(await chat.sendChatGifAction(general.id, "g:win")).toMatchObject({ success: false });
    const gif = await chat.sendChatGifAction(general.id, "g:hello");
    expect(gif.success && gif.data).toMatchObject({ gif: "g:hello" });
    expect(gif.success && gif.data.senderLook).not.toBeNull();
    expect(await chat.sendChatGifAction(general.id, "g:unknown")).toMatchObject({ success: false });
    await chat.sendChatStickerAction(general.id, "😂");
    await chat.sendChatStickerAction(general.id, "😂");
    as(ali);
    await premium.buyPremiumAction();
    expect((await chat.sendChatStickerAction(general.id, "a:fire")).success).toBe(true);
    expect((await chat.sendChatGifAction(general.id, "g:win")).success).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    const info = await chat.getChatMediaInfoAction();
    expect(info.success && info.data.premium).toBe(true);
    expect(info.success && info.data.popular[0]).toMatchObject({ key: "😂", count: 2 });
    expect(info.success && info.data.popular.map((p) => p.key)).toEqual(expect.arrayContaining(["g:hello", "a:fire", "g:win"]));
    const rooms = await core.listRooms(v(vali));
    expect(rooms[0].lastText).toContain("GIF");
  });
});

describe("premium va media katalog (sof funksiyalar)", () => {
  it("muddat: faol bo'lsa uzayadi, tugagan bo'lsa hozirdan boshlanadi", () => {
    const now = Date.UTC(2026, 10, 27);
    const day = 86_400_000;
    expect(lib.extendPremium(null, now).getTime()).toBe(now + 30 * day);
    expect(lib.extendPremium(new Date(now + 5 * day), now).getTime()).toBe(now + 35 * day);
    expect(lib.extendPremium(new Date(now - day), now).getTime()).toBe(now + 30 * day);
    expect(lib.daysLeft(new Date(now + 2.5 * day), now)).toBe(3);
    expect(lib.isPremium(new Date(now - 1), now)).toBe(false);
  });
  it("':so'z' — matnga mos emoji", () => {
    expect(media.searchEmoji("kul").slice(0, 3)).toEqual(expect.arrayContaining(["😀", "😂"]));
    expect(media.searchEmoji("rahmat")[0]).toBe("🙏");
    expect(media.searchEmoji("olov")).toContain("🔥");
    expect(media.searchEmoji("")).toEqual([]);
    expect(media.isPremiumSticker("a:fire")).toBe(true);
    expect(media.isGif("g:hello")).toBe(true);
  });
});
