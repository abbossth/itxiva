import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Types } from "mongoose";
import { NextRequest } from "next/server";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));

vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:TEST");
vi.stubEnv("TELEGRAM_BOT_USERNAME", "test_bot");
vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret");
vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://itxiva.uz");

// Telegram'ga haqiqiy so'rov ketmaydi: yuborilgan xabarlar shu ro'yxatga yig'iladi
type Sent = { method: string; chat_id: string; text: string; reply_markup?: { inline_keyboard: { text: string; url: string }[][] } };
const sent: Sent[] = [];
let respond: (body: Sent) => { status: number; body: unknown } = () => ({ status: 200, body: { ok: true } });

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: { body: string }) => {
    const body = { ...(JSON.parse(init.body) as Sent), method: String(url).split("/").pop()! };
    sent.push(body);
    const res = respond(body);
    return new Response(JSON.stringify(res.body), { status: res.status });
  })
);

const { User } = await import("@/lib/db/models/user.model");
const { createTelegramLinkToken, consumeTelegramLinkToken } = await import("@/lib/telegram/link");
const { sendNotifications } = await import("@/lib/notifications/notify");
const telegramActions = await import("@/actions/telegram.actions");
const webhook = await import("@/app/api/telegram/webhook/route");

const mkUser = (login: string, role: "mentor" | "student" = "student") =>
  User.create({ login, fullName: `${login} <b>`, role, passwordHash: "x" });

const update = (text: string, chatId = 777, secret = "webhook-secret", type = "private") =>
  new NextRequest("https://itxiva.uz/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ message: { text, chat: { id: chatId, type }, from: { username: "ali_tg" } } }),
  });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  sent.length = 0;
  respond = () => ({ status: 200, body: { ok: true } });
});

describe("telegram: hisobni ulash", () => {
  it("havola bot manziliga olib boradi va token bazada ochiq saqlanmaydi", async () => {
    const user = await mkUser("ali");
    actAs(sessionFor(user));
    const res = await telegramActions.createTelegramLinkAction();
    expect(res.success).toBe(true);
    const token = res.data!.url.split("start=")[1];
    expect(res.data!.url).toBe(`https://t.me/test_bot?start=${token}`);

    const stored = await User.findById(user._id).select("+telegramLink").lean();
    expect(stored?.telegramLink?.tokenHash).toBeTruthy();
    expect(stored?.telegramLink?.tokenHash).not.toBe(token);
  });

  it("/start <token> chatni bog'laydi, token bir marta ishlaydi", async () => {
    const user = await mkUser("ali");
    const token = await createTelegramLinkToken(user._id.toString());

    const res = await webhook.POST(update(`/start ${token}`));
    expect(res.status).toBe(200);
    const linked = await User.findById(user._id).lean();
    expect(linked?.telegram).toMatchObject({ chatId: "777", username: "ali_tg" });
    expect(sent.at(-1)?.text).toContain("Hisobingiz ulandi");
    // Ism HTML sifatida talqin qilinmaydi
    expect(sent.at(-1)?.text).toContain("ali &lt;b&gt;");

    expect(await consumeTelegramLinkToken(token, { id: 999 })).toEqual({ ok: false, reason: "invalid" });
  });

  it("muddati o'tgan va noto'g'ri token rad etiladi", async () => {
    const user = await mkUser("ali");
    const token = await createTelegramLinkToken(user._id.toString());
    await User.updateOne({ _id: user._id }, { $set: { "telegramLink.expiresAt": new Date(Date.now() - 1000) } });

    expect(await consumeTelegramLinkToken(token, { id: 777 })).toEqual({ ok: false, reason: "expired" });
    expect(await consumeTelegramLinkToken("a".repeat(32), { id: 777 })).toEqual({ ok: false, reason: "invalid" });
    expect(await consumeTelegramLinkToken("../../etc", { id: 777 })).toEqual({ ok: false, reason: "invalid" });
    expect((await User.findById(user._id).lean())?.telegram?.chatId ?? null).toBeNull();
  });

  it("bitta chat faqat bitta hisobga ulanadi", async () => {
    const first = await mkUser("ali");
    const second = await mkUser("vali");
    await consumeTelegramLinkToken(await createTelegramLinkToken(first._id.toString()), { id: 777 });
    await consumeTelegramLinkToken(await createTelegramLinkToken(second._id.toString()), { id: 777 });

    expect((await User.findById(first._id).lean())?.telegram?.chatId ?? null).toBeNull();
    expect((await User.findById(second._id).lean())?.telegram?.chatId).toBe("777");
  });

  it("uzish va /stop chatni hisobdan ajratadi", async () => {
    const user = await mkUser("ali");
    await consumeTelegramLinkToken(await createTelegramLinkToken(user._id.toString()), { id: 777 });

    actAs(sessionFor(user));
    expect((await telegramActions.getTelegramStatus()).linked).toBe(true);
    await telegramActions.unlinkTelegramAction();
    expect((await telegramActions.getTelegramStatus()).linked).toBe(false);

    await consumeTelegramLinkToken(await createTelegramLinkToken(user._id.toString()), { id: 777 });
    await webhook.POST(update("/stop"));
    expect((await User.findById(user._id).lean())?.telegram?.chatId ?? null).toBeNull();
  });
});

describe("telegram: webhook himoyasi", () => {
  it("maxfiy sarlavhasiz yoki noto'g'ri sarlavha bilan so'rov rad etiladi", async () => {
    const user = await mkUser("ali");
    const token = await createTelegramLinkToken(user._id.toString());
    expect((await webhook.POST(update(`/start ${token}`, 777, "notogri"))).status).toBe(401);
    expect((await User.findById(user._id).lean())?.telegram?.chatId ?? null).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("guruh chatidan kelgan buyruq hisobni bog'lamaydi", async () => {
    const user = await mkUser("ali");
    const token = await createTelegramLinkToken(user._id.toString());
    await webhook.POST(update(`/start ${token}`, -100123, "webhook-secret", "supergroup"));
    expect((await User.findById(user._id).lean())?.telegram?.chatId ?? null).toBeNull();
  });

  it("/status va /help javob beradi", async () => {
    await webhook.POST(update("/status"));
    expect(sent.at(-1)?.text).toContain("Ulanmagan");
    await webhook.POST(update("/help"));
    expect(sent.at(-1)?.text).toContain("/status");
  });
});

describe("telegram: bildirishnoma yuborish", () => {
  async function linked(login: string, chatId: number, role: "mentor" | "student" = "student") {
    const user = await mkUser(login, role);
    await consumeTelegramLinkToken(await createTelegramLinkToken(user._id.toString()), { id: chatId });
    sent.length = 0;
    return user;
  }

  it("xabar HTML formatda, natijaga olib boradigan tugma bilan ketadi", async () => {
    const user = await linked("ali", 777);
    const delivered = await sendNotifications({ ids: [user._id] }, "homework_graded", {
      lessonId: "6ac000000000000000000001",
      lessonTitle: "HTML <asoslari>",
      score: 90,
      coins: 18,
      feedback: "Zo'r & toza",
    });
    expect(delivered).toBe(1);
    const msg = sent[0];
    expect(msg.chat_id).toBe("777");
    expect(msg.text).toContain("<b>Vazifa tekshirildi</b>");
    expect(msg.text).toContain("HTML &lt;asoslari&gt;");
    expect(msg.text).toContain("Zo'r &amp; toza");
    expect(msg.reply_markup?.inline_keyboard[0][0]).toEqual({
      text: "Natijani ko'rish",
      url: "https://itxiva.uz/lessons/6ac000000000000000000001#homework",
    });
  });

  it("ulanmagan yoki shu turni o'chirgan foydalanuvchiga yuborilmaydi", async () => {
    const off = await linked("ali", 777);
    const on = await linked("vali", 888);
    const notLinked = await mkUser("guli");

    actAs(sessionFor(off));
    expect((await telegramActions.setNotificationPrefAction({ type: "lesson_new", enabled: false })).success).toBe(true);
    // O'quvchi mentor turlarini o'zgartira olmaydi
    expect((await telegramActions.setNotificationPrefAction({ type: "order_new", enabled: false })).success).toBe(false);

    const delivered = await sendNotifications({ ids: [off._id, on._id, notLinked._id] }, "lesson_new", {
      lessonId: "6ac000000000000000000001",
      lessonTitle: "CSS",
    });
    expect(delivered).toBe(1);
    expect(sent.map((s) => s.chat_id)).toEqual(["888"]);
  });

  it("bot bloklangan bo'lsa (403) chat avtomatik uziladi", async () => {
    const user = await linked("ali", 777);
    respond = () => ({ status: 403, body: { ok: false, description: "Forbidden: bot was blocked by the user" } });

    const delivered = await sendNotifications({ ids: [user._id] }, "coins_changed", { amount: 10, reason: "Davomat" });
    expect(delivered).toBe(0);
    expect((await User.findById(user._id).lean())?.telegram?.chatId ?? null).toBeNull();
  });

  it("boshqa xato (masalan 500) chatni uzmaydi", async () => {
    const user = await linked("ali", 777);
    respond = () => ({ status: 500, body: { ok: false, description: "Internal" } });
    await sendNotifications({ ids: [user._id] }, "coins_changed", { amount: -5, reason: "Tuzatish" });
    expect((await User.findById(user._id).lean())?.telegram?.chatId).toBe("777");
  });

  it("mentorlarga yuborish faqat mentorlarga boradi", async () => {
    await linked("oquvchi", 111);
    await linked("ustoz", 222, "mentor");
    await sendNotifications({ role: "mentor" }, "order_new", { productTitle: "Daftar", price: 50, studentName: "Ali" });
    expect(sent.map((s) => s.chat_id)).toEqual(["222"]);
  });
});

describe("telegram: dars eslatmasi", () => {
  // 2026-10-07 — chorshanba (3). Toshkent 16:30 = 11:30 UTC
  const at = (time: string) => new Date(`2026-10-07T${time}:00+05:00`);

  async function setup() {
    const { Group } = await import("@/lib/db/models/group.model");
    const { Lesson } = await import("@/lib/db/models/lesson.model");
    const { sendLessonReminders } = await import("@/lib/notifications/scheduled");
    const group = await Group.create({ name: "9-A", grade: 9, schedule: { days: [1, 3, 5], startTime: "16:30", endTime: "18:00" } });
    const other = await Group.create({ name: "9-B", grade: 9, schedule: { days: [2, 4, 6], startTime: "16:30", endTime: "18:00" } });
    const mk = async (login: string, chatId: number, role: "mentor" | "student", groupId?: Types.ObjectId) => {
      const user = await User.create({ login, fullName: login, role, passwordHash: "x", groupId });
      await User.updateOne({ _id: user._id }, { $set: { "telegram.chatId": String(chatId), "telegram.linkedAt": new Date() } });
      return user;
    };
    const student = await mk("ali", 111, "student", group._id);
    await mk("vali", 222, "student", other._id);
    const mentor = await mk("ustoz", 999, "mentor");
    return { Group, Lesson, sendLessonReminders, group, student, mentor };
  }

  it("bir soat qolganda shu guruh o'quvchilariga va mentorga bir marta ketadi", async () => {
    const { Lesson, sendLessonReminders, group } = await setup();
    await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "CSS Flexbox", date: at("16:30"), isPublished: true });

    // Hali erta (2 soat qolgan)
    expect(await sendLessonReminders(at("14:30"))).toEqual({ groups: 0, sent: 0 });

    expect(await sendLessonReminders(at("15:30"))).toEqual({ groups: 1, sent: 2 });
    expect(sent.map((s) => s.chat_id).sort()).toEqual(["111", "999"]);

    const toStudent = sent.find((s) => s.chat_id === "111")!;
    expect(toStudent.text).toContain("<b>Bir soatdan keyin dars</b>");
    expect(toStudent.text).toContain("16:30–18:00");
    expect(toStudent.text).toContain("CSS Flexbox");
    expect(toStudent.text).not.toContain("9-A");
    expect(sent.find((s) => s.chat_id === "999")!.text).toContain("9-A");

    // Keyingi chaqiruvlarda takrorlanmaydi
    expect(await sendLessonReminders(at("15:35"))).toEqual({ groups: 0, sent: 0 });
    expect(sent).toHaveLength(2);
  });

  it("kechikkan chaqiruv ham yuboradi, dars boshlangach esa yubormaydi", async () => {
    const { sendLessonReminders, Group, group } = await setup();
    expect((await sendLessonReminders(at("15:55"))).groups).toBe(1);
    expect(sent[0].text).toContain("35 daqiqadan keyin dars");

    await Group.updateOne({ _id: group._id }, { $set: { lessonReminderSentFor: null } });
    sent.length = 0;
    expect(await sendLessonReminders(at("16:40"))).toEqual({ groups: 0, sent: 0 });
  });

  it("profilda o'chirgan foydalanuvchiga bormaydi; sukut bo'yicha yoniq", async () => {
    const { sendLessonReminders, student, mentor } = await setup();
    actAs(sessionFor(student));
    expect((await telegramActions.setNotificationPrefAction({ type: "lesson_reminder", enabled: false })).success).toBe(true);

    expect(await sendLessonReminders(at("15:30"))).toEqual({ groups: 1, sent: 1 });
    expect(sent.map((s) => s.chat_id)).toEqual(["999"]);

    actAs(sessionFor(mentor));
    expect((await telegramActions.setNotificationPrefAction({ type: "lesson_reminder", enabled: false })).success).toBe(true);
  });

  it("nofaol guruh va dars kuni bo'lmagan guruhga yuborilmaydi", async () => {
    const { sendLessonReminders, Group, group } = await setup();
    await Group.updateOne({ _id: group._id }, { $set: { isActive: false } });
    expect(await sendLessonReminders(at("15:30"))).toEqual({ groups: 0, sent: 0 });
  });
});

describe("profil: reytingdagi salyut sozlamasi", () => {
  it("har kim faqat o'zi uchun o'chiradi; sukut bo'yicha yoqilgan", async () => {
    const { setCelebrationsEnabledAction } = await import("@/actions/profile.actions");
    const ali = await mkUser("ali");
    const vali = await mkUser("vali");
    expect((await User.findById(ali._id).lean())?.celebrationsEnabled).toBe(true);

    actAs(sessionFor(ali));
    expect((await setCelebrationsEnabledAction(false)).success).toBe(true);
    expect((await User.findById(ali._id).lean())?.celebrationsEnabled).toBe(false);
    expect((await User.findById(vali._id).lean())?.celebrationsEnabled).toBe(true);

    expect((await setCelebrationsEnabledAction("yoq")).success).toBe(false);
    actAs(null);
    await expect(setCelebrationsEnabledAction(true)).rejects.toThrow();
  });
});
