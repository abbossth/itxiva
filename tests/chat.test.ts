import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { ChatMessage, ChatRoom } = await import("@/lib/db/models/chat.model");
const chat = await import("@/actions/chat.actions");
const core = await import("@/lib/chat/core");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

async function seed() {
  const [g82, g92] = await Group.create([
    { name: "XSH-25I0802", grade: 8 },
    { name: "XSH-24I0902", grade: 9 },
  ]);
  type Gid = import("mongoose").Types.ObjectId | null;
  const mk = (login: string, fullName: string, groupId: Gid, role: "student" | "mentor" = "student") =>
    User.create({ login, fullName, role, passwordHash: "x", groupId: role === "student" ? groupId : null });
  const mentor = await mk("ustoz", "Abbos Ustoz", null, "mentor");
  const ali = await mk("ali", "Ali Valiyev", g82._id);
  const vali = await mk("vali", "Vali Karimov", g82._id);
  const guli = await mk("guli", "Guli Saidova", g92._id);
  const v = (u: typeof ali) => ({ userId: String(u._id), role: u.role, groupId: u.groupId ? String(u.groupId) : null, fullName: u.fullName });
  return { g82, g92, mentor, ali, vali, guli, v };
}
const as = (u: Parameters<typeof sessionFor>[0]) => actAs(sessionFor(u));

describe("chat: kim nimani ko'radi", () => {
  it("umumiy chat — hammaga; guruh chati — faqat o'z guruhiga va mentorga", async () => {
    const { ali, guli, mentor, v } = await seed();
    const aliRooms = await core.listRooms(v(ali));
    expect(aliRooms.map((r) => r.title)).toEqual(["Umumiy chat", "8.2 guruhi"]);
    const guliRooms = await core.listRooms(v(guli));
    expect(guliRooms.map((r) => r.title)).toEqual(["Umumiy chat", "9.2 guruhi"]);
    const mentorRooms = await core.listRooms(v(mentor));
    expect(mentorRooms.map((r) => r.title).sort()).toEqual(["8.2 guruhi", "9.2 guruhi", "Umumiy chat"]);

    // Guli 8.2 guruhi chatiga yoza olmaydi
    const g82room = aliRooms[1];
    as(guli);
    expect(await chat.sendChatMessageAction(g82room.id, "salom")).toMatchObject({ success: false });
    as(ali);
    expect((await chat.sendChatMessageAction(g82room.id, "Salom, 8.2!")).success).toBe(true);
  });

  it("xabar yuborilsa boshqalarda o'qilmagan bo'ladi, ko'rilgach nolga tushadi", async () => {
    const { ali, vali, v } = await seed();
    const general = (await core.listRooms(v(ali)))[0];
    as(ali);
    await chat.sendChatMessageAction(general.id, "Hammaga salom");
    await chat.sendChatMessageAction(general.id, "Ertaga jonli o'yin bor");
    expect((await core.listRooms(v(vali)))[0].unread).toBe(2);
    expect((await core.listRooms(v(ali)))[0].unread).toBe(0); // o'zi yozgan
    const msgs = await core.loadMessages(general.id, {});
    await core.markRead(general.id, String(vali._id), msgs[msgs.length - 1].id);
    expect(await core.unreadTotal(v(vali))).toBe(0);
  });
});

describe("chat: shaxsiy xabar va guruhlar", () => {
  it("shaxsiy suhbat — har juftlik uchun bitta; uchinchi o'quvchi ko'rmaydi, mentor kuzatuvda ko'radi", async () => {
    const { ali, vali, guli, mentor, v } = await seed();
    as(ali);
    const a = await chat.openDirectChatAction(String(vali._id));
    as(vali);
    const b = await chat.openDirectChatAction(String(ali._id));
    if (!a.success || !b.success) throw new Error("ochilmadi");
    expect(a.data.roomId).toBe(b.data.roomId);
    await chat.sendChatMessageAction(a.data.roomId, "Uy vazifani qildingmi?");
    expect((await core.listRooms(v(ali))).find((r) => r.kind === "dm")).toMatchObject({ title: "Vali Karimov", unread: 1 });
    as(guli);
    expect((await chat.sendChatMessageAction(a.data.roomId, "men ham")).success).toBe(false);
    const watch = await core.listRooms(v(mentor), { watch: true });
    expect(watch).toHaveLength(1);
    expect(watch[0].title).toContain("↔");
    // Mentor a'zo emas — yoza olmaydi, lekin xabarni o'chira oladi
    as(mentor);
    expect((await chat.sendChatMessageAction(a.data.roomId, "?")).success).toBe(false);
    const msg = await ChatMessage.findOne({ roomId: a.data.roomId }).lean();
    expect((await chat.deleteChatMessageAction(String(msg!._id))).success).toBe(true);
  });

  it("o'quvchi guruh yaratadi; a'zoni faqat egasi qo'shadi/chiqaradi; egasi chiqsa guruh boshqaga o'tadi", async () => {
    const { ali, vali, guli } = await seed();
    as(ali);
    const g = await chat.createChatGroupAction("Robototexnika", [String(vali._id)]);
    if (!g.success) throw new Error(g.error);
    as(vali);
    expect((await chat.addChatMembersAction(g.data.roomId, [String(guli._id)])).success).toBe(false); // egasi emas
    as(ali);
    expect(await chat.addChatMembersAction(g.data.roomId, [String(guli._id)])).toEqual({ success: true, data: { members: 3 } });
    as(guli);
    expect((await chat.sendChatMessageAction(g.data.roomId, "Rahmat!")).success).toBe(true);
    as(ali);
    expect((await chat.removeChatMemberAction(g.data.roomId, String(guli._id))).success).toBe(true);
    as(guli);
    expect((await chat.sendChatMessageAction(g.data.roomId, "?")).success).toBe(false);
    as(ali);
    await chat.leaveChatGroupAction(g.data.roomId);
    const room = await ChatRoom.findById(g.data.roomId).lean();
    expect(String(room!.ownerId)).toBe(String(vali._id));
    expect(room!.members.map(String)).toEqual([String(vali._id)]);
    as(vali);
    await chat.leaveChatGroupAction(g.data.roomId);
    expect(await ChatRoom.findById(g.data.roomId)).toBeNull(); // hech kim qolmadi — guruh o'chdi
  });

  it("guruh nomi va a'zolarsiz guruh rad etiladi", async () => {
    const { ali } = await seed();
    as(ali);
    expect(await chat.createChatGroupAction("ab", [])).toMatchObject({ success: false });
    expect(await chat.createChatGroupAction("Jamoa", [])).toMatchObject({ success: false, error: "Kamida bitta a'zo qo'shing" });
  });
});

describe("chat: moderatsiya", () => {
  it("o'z xabarini o'chiradi, boshqanikini yo'q; mentor taqig'i yozishni to'xtatadi", async () => {
    const { ali, vali, mentor, v } = await seed();
    const general = (await core.listRooms(v(ali)))[0];
    as(ali);
    const m = await chat.sendChatMessageAction(general.id, "salom");
    if (!m.success) throw new Error(m.error);
    as(vali);
    expect((await chat.deleteChatMessageAction(m.data.id)).success).toBe(false);
    as(ali);
    expect((await chat.deleteChatMessageAction(m.data.id)).success).toBe(true);
    expect((await core.loadMessages(general.id, {}))[0]).toMatchObject({ deleted: true, text: "" });

    as(mentor);
    expect((await chat.muteChatUserAction(String(vali._id), 2)).success).toBe(true);
    as(vali);
    expect(await chat.sendChatMessageAction(general.id, "...")).toMatchObject({ success: false });
    as(mentor);
    await chat.muteChatUserAction(String(vali._id), 0);
    as(vali);
    expect((await chat.sendChatMessageAction(general.id, "uzr")).success).toBe(true);
  });

  it("bo'sh xabar rad etiladi, uzun xabar 2000 belgiga qisqaradi", async () => {
    const { ali, v } = await seed();
    const general = (await core.listRooms(v(ali)))[0];
    as(ali);
    expect(await chat.sendChatMessageAction(general.id, "   ")).toMatchObject({ success: false, error: "Xabar bo'sh" });
    const long = await chat.sendChatMessageAction(general.id, "a".repeat(5000));
    expect(long.success && long.data.text.length).toBe(2000);
  });
});
