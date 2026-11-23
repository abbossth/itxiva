import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { LiveGame } = await import("@/lib/db/models/live-game.model");
const { LiveGamePlayer } = await import("@/lib/db/models/live-game-player.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const { AppSettings } = await import("@/lib/db/models/app-settings.model");
const { AttendanceSession } = await import("@/lib/db/models/attendance-session.model");
const { AttendanceRecord } = await import("@/lib/db/models/attendance-record.model");
const live = await import("@/actions/live-game.actions");
const { expireStudentLobbies } = await import("@/lib/live-game/student-games");
const notifyMod = await import("@/lib/notifications/notify");

const NOW = new Date("2026-11-21T15:00:00Z"); // Shanba kechqurun (Toshkent 20:00) — dars yo'q
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
let n = 0;
const nonce = () => `test-${++n}-nonce`;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function seed() {
  const mentor = await User.create({ login: "u", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const [g8a, g8b, g9] = await Group.create([
    { name: "8-A", grade: 8 },
    { name: "8-B", grade: 8 },
    { name: "9-A", grade: 9 },
  ]);
  const mk = (login: string, fullName: string, groupId: import("mongoose").Types.ObjectId, coins = 50) =>
    User.create({ login, fullName, role: "student", passwordHash: "x", groupId, spendableBalance: coins, totalCoins: coins });
  const ali = await mk("ali", "Ali", g8a._id);
  const vali = await mk("vali", "Vali", g8a._id);
  const sardor = await mk("sardor", "Sardor", g8a._id);
  const laylo = await mk("laylo", "Laylo", g8b._id);
  const olim = await mk("olim", "Olim", g9._id);
  const lesson = await Lesson.create({ groupId: g8a._id, quarter: 1, order: 1, title: "D", isPublished: true, date: NOW });
  await Quiz.create({
    lessonId: lesson._id,
    title: "T",
    isPublished: true,
    questions: Array.from({ length: 6 }, (_, i) => ({ type: "single_choice", prompt: `${i}?`, options: ["ha", "yo'q"], correctAnswers: ["ha"], points: 1, timeLimit: 10 })),
  });
  return { mentor, g8a, g8b, g9, ali, vali, sardor, laylo, olim };
}

const balance = async (u: { _id: unknown }) => (await User.findById(u._id).lean())?.spendableBalance;
const as = (u: Parameters<typeof sessionFor>[0]) => actAs(sessionFor(u));

describe("o'quvchilar o'yini: birgalikda coin yig'ish", () => {
  it("klassik butun sinf — guruhnikidek 10 coin (15 − 5 skidka): 2 + 2 + 3 + 1 + 2 — to'lgach boshlanadi; ortiqchasi rad etiladi", async () => {
    const { ali, vali, sardor, laylo } = await seed();
    as(ali);
    const res = await live.createStudentGameAction({ mode: "classic", audience: "grade", count: 5, first: 2, nonce: nonce() });
    if (!res.success) throw new Error(res.error);
    const id = res.data.gameId;
    const g0 = (await LiveGame.findById(id).lean())!;
    expect(g0).toMatchObject({ studentGame: true, price: 10, paid: 2, grade: 8 }); // butun sinf uchun qo'shimcha narx yo'q

    as(vali);
    expect((await live.contributeStudentGameAction(id, 2, nonce())).success).toBe(true);
    as(laylo); // boshqa guruh, lekin 8-sinf
    expect((await live.contributeStudentGameAction(id, 3, nonce())).success).toBe(true);
    as(sardor);
    expect((await live.contributeStudentGameAction(id, 1, nonce())).success).toBe(true);
    // 10 - 8 = 2 qoldi: 7 qo'shib bo'lmaydi va coin yechilmaydi
    as(vali);
    const over = await live.contributeStudentGameAction(id, 7, nonce());
    expect(over.success).toBe(false);
    expect(await balance(vali)).toBe(48);
    as(ali);
    const last = await live.contributeStudentGameAction(id, 2, nonce());
    expect(last.success && last.data).toEqual({ paid: 10, price: 10 });
    expect(await balance(ali)).toBe(50 - 4);
    const g1 = (await LiveGame.findById(id).lean())!;
    expect(g1.fundedAt).toBeTruthy();
    expect(await LiveGamePlayer.countDocuments({ gameId: id })).toBe(4); // hissa qo'shganlar o'yinga ham qo'shildi

    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.studentGame).toMatchObject({ creator: true, funded: true, paid: 10, price: 10, mine: 4 });
  });

  it("server o'zi boshqaradi: boshlanadi, natija ochiladi, keyingi savol; 2 o'yinchida sovrin yo'q", async () => {
    const { ali, vali } = await seed();
    as(ali);
    const res = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 10, nonce: nonce() });
    if (!res.success) throw new Error(res.error);
    const id = res.data.gameId;
    as(vali);
    await live.joinLiveGameAction(id);
    const poll = async () => {
      as(ali);
      return (await live.getLivePlayerStateAction(id)) as { success: true; data: { status: string; index: number } };
    };
    await LiveGame.updateOne({ _id: id }, { $set: { needPlayers: 2 } });
    as(ali);
    expect((await live.startStudentGameAction(id)).success).toBe(true); // intro boshlanadi
    tick(5000);
    expect((await poll()).data).toMatchObject({ status: "question", index: 0 });
    // Hamma javob bersa — natija darhol ochiladi
    as(ali);
    await live.answerLiveQuestionAction(id, 0, "ha");
    as(vali);
    await live.answerLiveQuestionAction(id, 0, "yo'q");
    expect((await poll()).data.status).toBe("reveal");
    tick(10_500);
    expect((await poll()).data).toMatchObject({ status: "question", index: 1 });
    // Qolgani: hech kim javob bermasa ham vaqt bo'yicha oxirigacha boradi (mini o'yinlar bilan)
    for (let i = 0; i < 40 && (await poll()).data.status !== "finished"; i++) tick(30_000);
    expect((await poll()).data.status).toBe("finished");
    const bonus = await CoinLedger.countDocuments({ type: { $in: ["bonus", "quiz"] } });
    expect(bonus).toBe(0);
    expect(await balance(vali)).toBe(50);
  });

  it("kamida 3 o'yinchi: g'oliblarga 30 / 20 / 10 coin, test savoli coini yo'q", async () => {
    const { ali, vali, sardor } = await seed();
    as(ali);
    const res = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 10, nonce: nonce() });
    if (!res.success) throw new Error(res.error);
    const id = res.data.gameId;
    // Mini o'yinlar (omad g'ildiragi tasodifiy ochko beradi) o'rinlarni aralashtirmasin
    await LiveGame.updateOne({ _id: id }, { $set: { "options.minigames": false, "options.zone": false } });
    for (const u of [vali, sardor]) {
      as(u);
      await live.joinLiveGameAction(id);
    }
    const poll = async () => {
      as(ali);
      return (await live.getLivePlayerStateAction(id)) as { success: true; data: { status: string; index: number } };
    };
    await LiveGame.updateOne({ _id: id }, { $set: { needPlayers: 3 } });
    as(ali);
    expect((await live.startStudentGameAction(id)).success).toBe(true);
    tick(5000);
    expect((await poll()).data.status).toBe("question");
    // Ali tez, Vali sekinroq, Sardor eng oxirida — hammasi to'g'ri
    as(ali);
    tick(800);
    await live.answerLiveQuestionAction(id, 0, "ha");
    tick(2000);
    as(vali);
    await live.answerLiveQuestionAction(id, 0, "ha");
    tick(2000);
    as(sardor);
    await live.answerLiveQuestionAction(id, 0, "ha");
    for (let i = 0; i < 40 && (await poll()).data.status !== "finished"; i++) tick(30_000);
    const won = async (u: { _id: import("mongoose").Types.ObjectId }) => (await CoinLedger.findOne({ studentId: u._id, type: "bonus" }).lean())?.amount ?? 0;
    expect([await won(ali), await won(vali), await won(sardor)]).toEqual([30, 20, 10]);
    // Jonli o'yin sovrini — faqat coin, XP berilmaydi
    expect(await CoinLedger.countDocuments({ type: "bonus", xp: { $ne: 0 } })).toBe(0);
    expect(await CoinLedger.countDocuments({ type: "quiz" })).toBe(0);
    expect(await balance(ali)).toBe(50 - 10 + 30);
  });

  it("bepul davr: coin yig'ilmaydi, egasi boshlaydi, sovrin yo'q; skidka 0 bo'lsa — to'liq narx", async () => {
    const { ali, vali } = await seed();
    await AppSettings.updateOne(
      { key: "global" },
      { $set: { studentGames: { freeFrom: new Date(NOW.getTime() - 60_000).toISOString(), freeUntil: new Date(NOW.getTime() + 3_600_000).toISOString() } } },
      { upsert: true }
    );
    as(ali);
    const setup = await live.getStudentGameSetupAction();
    expect(setup.success && setup.data).toMatchObject({ freeUntil: expect.any(String), discount: 0 });
    expect(setup.success && setup.data.prices.classic).toBe(0);
    const res = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 0, nonce: nonce() });
    if (!res.success) throw new Error(res.error);
    expect(await balance(ali)).toBe(50);
    const g = (await LiveGame.findById(res.data.gameId).lean())!;
    expect(g).toMatchObject({ price: 0, paid: 0, prizes: [0, 0, 0] });
    as(vali);
    expect((await live.startStudentGameAction(res.data.gameId)).success).toBe(false); // faqat egasi
    as(ali);
    // Kamida 5 o'yinchi kerak — 2 kishi bilan boshlanmaydi
    expect((await live.startStudentGameAction(res.data.gameId)).success).toBe(false);
    await LiveGame.updateOne({ _id: res.data.gameId }, { $set: { needPlayers: 1 } });
    expect((await live.startStudentGameAction(res.data.gameId)).success).toBe(true);
    expect((await LiveGame.findById(res.data.gameId).lean())?.introAt).toBeTruthy();

    // Bepul davr tugadi, skidka 0 — to'liq narx
    await LiveGame.updateMany({}, { $set: { status: "finished" } });
    await AppSettings.updateOne({ key: "global" }, { $set: { studentGames: { discount: 0 } } });
    const full = await live.getStudentGameSetupAction();
    expect(full.success && full.data.prices.classic).toBe(15);
  });

  it("kamida N o'yinchi: tayyor bo'lmasa boshlanmaydi; mentor boshlaydi; yangi o'yinchi qo'shilmasa — o'zi boshlanadi", async () => {
    const { mentor, ali, vali, sardor } = await seed();
    await AppSettings.updateOne({ key: "global" }, { $set: { studentGames: { minPlayersToStart: 2, autoStartMin: 1 } } }, { upsert: true });
    as(ali);
    const a = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 10, nonce: nonce() });
    if (!a.success) throw new Error(a.error);
    // Coin yig'ilgan, lekin bitta o'yinchi — mentor ham boshlay olmaydi, o'zi ham boshlanmaydi
    as(mentor);
    expect((await live.startStudentGameByMentorAction(a.data.gameId)).success).toBe(false);
    tick(5 * 60_000);
    as(ali);
    await live.getLivePlayerStateAction(a.data.gameId);
    expect((await LiveGame.findById(a.data.gameId).lean())?.introAt).toBeFalsy();
    // Ikkinchi o'yinchi qo'shildi — 1 daqiqa hech kim qo'shilmasa o'zi boshlanadi
    as(vali);
    await live.joinLiveGameAction(a.data.gameId);
    tick(30_000);
    await live.getLivePlayerStateAction(a.data.gameId);
    expect((await LiveGame.findById(a.data.gameId).lean())?.introAt).toBeFalsy();
    tick(31_000);
    await live.getLivePlayerStateAction(a.data.gameId);
    expect((await LiveGame.findById(a.data.gameId).lean())?.introAt).toBeTruthy();

    // Mentor tayyor o'yinni boshlaydi
    await LiveGame.updateMany({}, { $set: { status: "finished" } });
    as(sardor);
    const b = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 10, nonce: nonce() });
    if (!b.success) throw new Error(b.error);
    as(vali);
    await live.joinLiveGameAction(b.data.gameId);
    as(mentor);
    expect((await live.startStudentGameByMentorAction(b.data.gameId)).success).toBe(true);
    expect((await LiveGame.findById(b.data.gameId).lean())?.introAt).toBeTruthy();
  });

  it("bekor qilinsa yoki coin yig'ilmasa — har kimga o'z coini qaytariladi", async () => {
    const { ali, vali } = await seed();
    as(ali);
    const a = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 4, nonce: nonce() });
    if (!a.success) throw new Error(a.error);
    as(vali);
    await live.contributeStudentGameAction(a.data.gameId, 3, nonce());
    as(ali);
    expect((await live.cancelMyStudentGameAction(a.data.gameId)).success).toBe(true);
    expect([await balance(ali), await balance(vali)]).toEqual([50, 50]);

    const b = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 6, nonce: nonce() });
    if (!b.success) throw new Error(b.error);
    tick(21 * 60 * 1000);
    expect(await expireStudentLobbies()).toBe(1);
    expect(await balance(ali)).toBe(50);
    expect((await LiveGame.findById(b.data.gameId).lean())?.status).toBe("finished");
  });

  it("kirish: boshqa sinf kira olmaydi; dars vaqtida yaratib bo'lmaydi; mentor o'yini o'quvchi o'yinini to'xtatadi", async () => {
    const { mentor, g8a, ali, olim } = await seed();
    as(ali);
    const res = await live.createStudentGameAction({ mode: "classic", audience: "grade", count: 5, first: 5, nonce: nonce() });
    if (!res.success) throw new Error(res.error);
    as(olim);
    expect((await live.joinLiveGameAction(res.data.gameId)).success).toBe(false);

    // Mentor shu guruhda o'yin ochdi — boshlanmagan o'quvchi o'yini bekor, coin qaytadi
    as(mentor);
    await live.createLiveGameAction({ groupId: g8a._id.toString(), mode: "classic", source: "all", count: 5 });
    expect((await LiveGame.findById(res.data.gameId).lean())?.status).toBe("finished");
    expect(await balance(ali)).toBe(50);

    await LiveGame.updateMany({}, { $set: { status: "finished" } });
    await AttendanceSession.create({ groupId: g8a._id, mentorId: mentor._id, status: "active", currentCode: "ABC123", currentToken: "t" });
    as(ali);
    const blocked = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 5, nonce: nonce() });
    expect(!blocked.success && blocked.error).toMatch(/dars/i);
    expect(await balance(ali)).toBe(50);
  });

  it("darsni sababsiz qoldirgan — 2 kun jonli o'yin yopiq; sababli qilinsa — ochiladi", async () => {
    const { mentor, g8a, ali, vali } = await seed();
    const session = await AttendanceSession.create({ groupId: g8a._id, mentorId: mentor._id, status: "closed", currentCode: "XYZ123", currentToken: "t2" });
    const rec = await AttendanceRecord.create({ sessionId: session._id, studentId: vali._id, groupId: g8a._id, status: "absent", method: "manual", markedAt: new Date(NOW.getTime() - 86_400_000) });
    as(vali);
    const create = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 5, nonce: nonce() });
    expect(!create.success && create.error).toMatch(/sababsiz/);
    as(ali);
    const g = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 5, nonce: nonce() });
    if (!g.success) throw new Error(g.error);
    as(vali);
    expect((await live.joinLiveGameAction(g.data.gameId)).success).toBe(false);
    expect((await live.contributeStudentGameAction(g.data.gameId, 2, nonce())).success).toBe(false);
    expect(await balance(vali)).toBe(50);
    // Mentor o'yiniga ham (sukut bo'yicha)
    as(mentor);
    const mg = await live.createLiveGameAction({ groupId: g8a._id.toString(), mode: "classic", source: "all", count: 5 });
    if (!mg.success) throw new Error(mg.error);
    as(vali);
    expect((await live.joinLiveGameAction(mg.data.gameId)).success).toBe(false);
    // Sababli deb belgilandi — darhol ochiladi
    await AttendanceRecord.updateOne({ _id: rec._id }, { $set: { status: "excused" } });
    expect((await live.joinLiveGameAction(mg.data.gameId)).success).toBe(true);
  });
});

describe("o'quvchilar o'yini: Telegram e'loni", () => {
  const link = (ids: import("mongoose").Types.ObjectId[]) => Promise.all(ids.map((id, i) => User.updateOne({ _id: id }, { $set: { "telegram.chatId": String(100 + i) } })));

  it("butun sinf o'yini — shu sinfning barcha guruhlariga (egasidan tashqari), sovrin va coin yig'ish ma'lumoti bilan", async () => {
    const { ali, vali, sardor, laylo, olim } = await seed();
    await link([ali._id, vali._id, sardor._id, laylo._id, olim._id]);
    const spy = vi.mocked(notifyMod.notifyMany);
    spy.mockClear();
    as(ali);
    const res = await live.createStudentGameAction({ mode: "classic", audience: "grade", count: 5, first: 2, nonce: nonce() });
    if (!res.success) throw new Error(res.error);
    expect(spy).toHaveBeenCalledTimes(1);
    const [ids, type, payload] = spy.mock.calls[0];
    expect(type).toBe("live_game");
    expect(ids.map(String).sort()).toEqual([vali._id, sardor._id, laylo._id].map(String).sort()); // 9-sinf va egasi yo'q
    expect(payload).toMatchObject({
      gameId: res.data.gameId,
      student: { creatorName: "Ali", audience: "8-sinflar uchun umumiy o'yin", questions: 5, prizes: [30, 20, 10], price: 10, paid: 2, needPlayers: 3 },
    });
    // Mentorga ham xabar
    expect(vi.mocked(notifyMod.notifyMentors)).toHaveBeenLastCalledWith(
      "student_game_new",
      expect.objectContaining({ gameId: res.data.gameId, creatorName: "Ali", groupName: "8-A", audience: "8-sinflar uchun umumiy o'yin", recipients: 3 })
    );
  });

  it("guruh o'yini — faqat o'z guruhiga", async () => {
    const { ali, vali, sardor, laylo } = await seed();
    await link([vali._id, sardor._id, laylo._id]);
    const spy = vi.mocked(notifyMod.notifyMany);
    spy.mockClear();
    as(ali);
    const res = await live.createStudentGameAction({ mode: "classic", audience: "group", count: 5, first: 2, nonce: nonce() });
    if (!res.success) throw new Error(res.error);
    expect(spy.mock.calls[0][0].map(String).sort()).toEqual([vali._id, sardor._id].map(String).sort());
    expect(spy.mock.calls[0][2]).toMatchObject({ student: { audience: "Guruh: 8-A" } });
  });
});
