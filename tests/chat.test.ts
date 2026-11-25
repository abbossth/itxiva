import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
const notify = vi.hoisted(() => ({ notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => notify);
const push = vi.hoisted(() => ({ sendPush: vi.fn(async () => 1), pushPublicKey: () => null }));
vi.mock("@/lib/push", () => push);

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

describe("chat: javob, reaksiya, stiker", () => {
  it("javob iqtibos bilan saqlanadi; reaksiya almashadi va qayta bosilsa olinadi; o'zgarish so'rovda keladi", async () => {
    const { ali, vali, v } = await seed();
    const general = (await core.listRooms(v(ali)))[0];
    as(ali);
    const q = await chat.sendChatMessageAction(general.id, "Uy vazifa nechanchi bet?");
    if (!q.success) throw new Error(q.error);
    as(vali);
    const a = await chat.sendChatMessageAction(general.id, "45-bet", q.data.id);
    expect(a.success && a.data.replyTo).toMatchObject({ id: q.data.id, senderName: "Ali Valiyev", text: "Uy vazifa nechanchi bet?" });

    const t0 = new Date(Date.now() - 1);
    expect(await chat.toggleChatReactionAction(q.data.id, "👍")).toEqual({ success: true, data: { emoji: "👍" } });
    expect(await chat.toggleChatReactionAction(q.data.id, "❤️")).toEqual({ success: true, data: { emoji: "❤️" } });
    const changed = await core.loadChanged(general.id, t0);
    expect(changed.map((m) => m.id)).toEqual([q.data.id]);
    expect(changed[0].reactions).toEqual([{ emoji: "❤️", users: [String(vali._id)] }]); // bitta odam — bitta reaksiya
    expect(await chat.toggleChatReactionAction(q.data.id, "❤️")).toEqual({ success: true, data: { emoji: null } });
    expect(await chat.toggleChatReactionAction(q.data.id, "💩")).toMatchObject({ success: false });
  });

  it("stiker faqat to'plamdan; ro'yxatda 'Stiker' deb ko'rinadi", async () => {
    const { ali, vali, v } = await seed();
    const general = (await core.listRooms(v(ali)))[0];
    as(ali);
    expect((await chat.sendChatStickerAction(general.id, "<script>")).success).toBe(false);
    const s = await chat.sendChatStickerAction(general.id, "🔥");
    expect(s.success && s.data.sticker).toBe("🔥");
    expect((await core.listRooms(v(vali)))[0].lastText).toBe("Ali: 🔥 Stiker");
  });
});

describe("chat: guruh boshqaruvi va xavfsizlik", () => {
  it("egasi admin tayinlaydi; admin a'zo qo'shadi; 'faqat adminlar yozadi' rejimi", async () => {
    const { ali, vali, guli } = await seed();
    as(ali);
    const g = await chat.createChatGroupAction("E'lonlar", [String(vali._id)]);
    if (!g.success) throw new Error(g.error);
    as(vali);
    expect((await chat.setChatAdminAction(g.data.roomId, String(vali._id), true)).success).toBe(false); // o'zini admin qila olmaydi
    as(ali);
    expect((await chat.setChatAdminAction(g.data.roomId, String(vali._id), true)).success).toBe(true);
    as(vali);
    expect((await chat.addChatMembersAction(g.data.roomId, [String(guli._id)])).success).toBe(true);
    expect((await chat.setChatOnlyAdminsAction(g.data.roomId, true)).success).toBe(true);
    as(guli);
    expect(await chat.sendChatMessageAction(g.data.roomId, "salom")).toMatchObject({ success: false, error: "Bu guruhda faqat adminlar yozadi" });
    expect((await chat.removeChatMemberAction(g.data.roomId, String(vali._id))).success).toBe(false);
    as(vali);
    expect((await chat.sendChatMessageAction(g.data.roomId, "Ertaga dars 9:00 da")).success).toBe(true);
    const info = await chat.getChatMembersAction(g.data.roomId);
    expect(info.success && info.data.members.find((m) => m.id === String(vali._id))).toMatchObject({ admin: true, owner: false });
    // Egasi chiqsa — guruh adminga o'tadi
    as(ali);
    await chat.leaveChatGroupAction(g.data.roomId);
    expect(String((await ChatRoom.findById(g.data.roomId).lean())!.ownerId)).toBe(String(vali._id));
    // Egasi guruhni o'chiradi — xabarlar ham o'chadi
    as(vali);
    expect((await chat.deleteChatGroupAction(g.data.roomId)).success).toBe(true);
    expect(await ChatMessage.countDocuments({ roomId: g.data.roomId })).toBe(0);
  });

  it("bloklangan odam shaxsiy xabar yoza olmaydi va guruhga qo'sha olmaydi; ustozni bloklab bo'lmaydi", async () => {
    const { ali, vali, guli, mentor } = await seed();
    as(ali);
    const dm = await chat.openDirectChatAction(String(vali._id));
    if (!dm.success) throw new Error(dm.error);
    as(vali);
    expect((await chat.setChatBlockAction(String(ali._id), true)).success).toBe(true);
    expect((await chat.setChatBlockAction(String(mentor._id), true)).success).toBe(false);
    as(ali);
    expect(await chat.sendChatMessageAction(dm.data.roomId, "?")).toMatchObject({ success: false, error: "Bu foydalanuvchi sizdan xabar qabul qilmaydi" });
    expect((await chat.openDirectChatAction(String(vali._id))).success).toBe(false);
    const g = await chat.createChatGroupAction("Jamoa", [String(guli._id)]);
    if (!g.success) throw new Error(g.error);
    expect((await chat.addChatMembersAction(g.data.roomId, [String(vali._id)])).success).toBe(false);
    as(vali);
    await chat.setChatBlockAction(String(ali._id), false);
    as(ali);
    expect((await chat.sendChatMessageAction(dm.data.roomId, "uzr")).success).toBe(true);
  });

  it("shikoyat mentorlarga boradi", async () => {
    const { ali, vali, v } = await seed();
    const general = (await core.listRooms(v(ali)))[0];
    as(ali);
    const m = await chat.sendChatMessageAction(general.id, "yomon so'z");
    if (!m.success) throw new Error(m.error);
    as(vali);
    expect((await chat.reportChatMessageAction(m.data.id, "haqorat")).success).toBe(true);
    expect(notify.notifyMentors).toHaveBeenCalledWith("chat_message", expect.objectContaining({ roomTitle: "⚠️ Shikoyat" }));
  });

  it("shaxsiy xabar oflayn suhbatdoshga Telegram orqali boradi (10 daqiqada bir marta)", async () => {
    const { ali, vali } = await seed();
    as(ali);
    const dm = await chat.openDirectChatAction(String(vali._id));
    if (!dm.success) throw new Error(dm.error);
    notify.notifyMany.mockClear();
    await chat.sendChatMessageAction(dm.data.roomId, "salom");
    await chat.sendChatMessageAction(dm.data.roomId, "qalaysan?");
    expect(notify.notifyMany).toHaveBeenCalledTimes(1);
    expect(notify.notifyMany).toHaveBeenCalledWith([String(vali._id)], "chat_message", expect.objectContaining({ text: "salom" }));
  });
});

describe("chat: push va ovozsiz suhbat", () => {
  it("shaxsiy xabar push bo'lib boradi; ovozsiz qilingan suhbatdan push/Telegram kelmaydi va menyu sonida sanalmaydi", async () => {
    const { ali, vali, v } = await seed();
    as(ali);
    const dm = await chat.openDirectChatAction(String(vali._id));
    if (!dm.success) throw new Error(dm.error);
    push.sendPush.mockClear();
    await chat.sendChatMessageAction(dm.data.roomId, "salom");
    expect(push.sendPush).toHaveBeenCalledWith([String(vali._id)], expect.objectContaining({ title: "Ali Valiyev", body: "salom", url: `/chat?room=${dm.data.roomId}` }));

    as(vali);
    expect((await chat.setChatRoomMuteAction(dm.data.roomId, true)).success).toBe(true);
    push.sendPush.mockClear();
    notify.notifyMany.mockClear();
    as(ali);
    await chat.sendChatMessageAction(dm.data.roomId, "javob ber");
    expect(push.sendPush).not.toHaveBeenCalled();
    expect(notify.notifyMany).not.toHaveBeenCalled();
    const room = (await core.listRooms(v(vali))).find((r) => r.kind === "dm")!;
    expect(room).toMatchObject({ muted: true, unread: 2 }); // ro'yxatda ko'rinadi
    expect(await core.unreadTotal(v(vali))).toBe(0); // lekin nishonda sanalmaydi
    as(vali);
    await chat.setChatRoomMuteAction(dm.data.roomId, false);
    expect(await core.unreadTotal(v(vali))).toBe(2);
  });

  it("umumiy chatda faqat xabariga javob berilgan odamga push boradi", async () => {
    const { ali, vali, v } = await seed();
    const general = (await core.listRooms(v(ali)))[0];
    as(ali);
    const q = await chat.sendChatMessageAction(general.id, "Kim yordam beradi?");
    if (!q.success) throw new Error(q.error);
    push.sendPush.mockClear();
    as(vali);
    await chat.sendChatMessageAction(general.id, "Bu oddiy xabar");
    expect(push.sendPush).not.toHaveBeenCalled();
    await chat.sendChatMessageAction(general.id, "Men!", q.data.id);
    expect(push.sendPush).toHaveBeenCalledWith([String(ali._id)], expect.objectContaining({ body: "Men!" }));
  });
});

describe("chat: Telegram — shaxsiy xabar, belgilash, javob", () => {
  it("guruh chatida @belgilangan o'quvchiga Telegram boradi; oddiy xabar bormaydi; boshqa guruhdagini belgilab bo'lmaydi", async () => {
    const { ali, vali, guli, v } = await seed();
    const g82 = (await core.listRooms(v(ali))).find((r) => r.kind === "group")!;
    as(ali);
    notify.notifyMany.mockClear();
    await chat.sendChatMessageAction(g82.id, "Salom hammaga");
    expect(notify.notifyMany).not.toHaveBeenCalled();

    const m = await chat.sendChatMessageAction(g82.id, "@Vali Karimov uy vazifani tashla", null, [String(vali._id), String(guli._id)]);
    expect(m.success && m.data.mentions).toEqual([{ id: String(vali._id), name: "Vali Karimov" }]); // Guli bu guruhda emas
    expect(notify.notifyMany).toHaveBeenCalledWith([String(vali._id)], "chat_message", expect.objectContaining({ reason: "mention", roomTitle: "8.2 guruhi" }));

    // Matnda "@Ism" yo'q bo'lsa — belgilash hisoblanmaydi
    const n = await chat.sendChatMessageAction(g82.id, "yashirin belgilash", null, [String(vali._id)]);
    expect(n.success && n.data.mentions).toEqual([]);
  });

  it("o'quvchilar guruhida oddiy xabar Telegramga bormaydi (faqat push), javob esa boradi", async () => {
    const { ali, vali } = await seed();
    as(ali);
    const g = await chat.createChatGroupAction("Jamoa", [String(vali._id)]);
    if (!g.success) throw new Error(g.error);
    notify.notifyMany.mockClear();
    push.sendPush.mockClear();
    const q = await chat.sendChatMessageAction(g.data.roomId, "Ertaga uchrashamizmi?");
    if (!q.success) throw new Error(q.error);
    expect(notify.notifyMany).not.toHaveBeenCalled();
    expect(push.sendPush).toHaveBeenCalledWith([String(vali._id)], expect.objectContaining({ title: "Ali Valiyev · Jamoa" }));
    as(vali);
    await chat.sendChatMessageAction(g.data.roomId, "Ha!", q.data.id);
    expect(notify.notifyMany).toHaveBeenCalledWith([String(ali._id)], "chat_message", expect.objectContaining({ reason: "reply", roomTitle: "Jamoa" }));
  });
});
