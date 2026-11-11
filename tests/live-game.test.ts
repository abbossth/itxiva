import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { LiveGame } = await import("@/lib/db/models/live-game.model");
const { LiveGamePlayer } = await import("@/lib/db/models/live-game-player.model");
const { CoinLedger } = await import("@/lib/db/models/coin-ledger.model");
const live = await import("@/actions/live-game.actions");
const modes = await import("@/lib/live-game/modes");
const { pickQuestions } = await import("@/lib/live-game/questions");
const { finishStaleLiveGames } = await import("@/lib/live-game/finish");

const NOW = new Date("2026-11-10T16:40:00+05:00");
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

async function seed() {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9 });
  const other = await Group.create({ name: "9-B", grade: 9 });
  const mk = (login: string, groupId = group._id) =>
    User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId, totalCoins: 0, spendableBalance: 0 });
  const [ali, vali, guli, begona] = await Promise.all([mk("ali"), mk("vali"), mk("guli"), mk("begona", other._id)]);

  const today = await Lesson.create({ groupId: group._id, quarter: 2, order: 2, title: "Bugun", isPublished: true, date: NOW });
  const old = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Kecha", isPublished: true, date: new Date(NOW.getTime() - 7 * 86_400_000) });
  const sc = (prompt: string, ok: string) => ({ type: "single_choice" as const, prompt, options: [ok, "x", "y"], correctAnswers: [ok], points: 1, timeLimit: 10 });
  await Quiz.create({
    lessonId: today._id,
    title: "Bugungi",
    isPublished: true,
    questions: [sc("1+1?", "2"), sc("2+2?", "4"), { type: "open_ended" as const, prompt: "Ochiq savol", points: 5 }],
  });
  await Quiz.create({ lessonId: old._id, title: "Eski", isPublished: true, questions: [sc("3+3?", "6"), sc("4+4?", "8")] });
  actAs(sessionFor(mentor));
  return { mentor, group, other, ali, vali, guli, begona, gid: group._id.toString() };
}

type Student = Parameters<typeof sessionFor>[0];
const as = (u: Student) => actAs(sessionFor(u));

async function create(gid: string, mentor: Student, mode: "classic" | "survival" | "chest" | "team", source: "today" | "all" = "all", teams = 2) {
  as(mentor);
  const res = await live.createLiveGameAction({ groupId: gid, mode, source, count: 5, teams });
  if (!res.success) throw new Error(res.error);
  return res.data.gameId;
}

/** Joriy savolning to'g'ri javobi (sinov uchun bazadan) */
const correctOf = async (gameId: string) => {
  const g = await LiveGame.findById(gameId).lean();
  return g!.questions[g!.index].correctAnswers[0];
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("qoidalar", () => {
  it("survival: xato — jon ketadi, 0 da chiqadi; chest: to'g'ri — 300 va sandiq, ×2 bir marta", () => {
    const p = { score: 0, streak: 0, lives: 1, eliminated: false, double: false };
    expect(modes.scoreAnswer("survival", p, { isCorrect: false, elapsedMs: 0, limitSec: 10 })).toMatchObject({ lives: 0, eliminated: true, points: 0 });
    expect(modes.scoreAnswer("chest", { ...p, double: true }, { isCorrect: true, elapsedMs: 0, limitSec: 10 })).toMatchObject({ points: 600, chests: 1, double: false });
    expect(modes.scoreAnswer("classic", p, { isCorrect: true, elapsedMs: 0, limitSec: 10 }).points).toBe(1000);
  });

  it("sandiq natijalari vaznli va chegarada ishlaydi; jamoalar teng taqsimlanadi va o'rtacha olinadi", () => {
    expect(modes.rollChest(0).kind).toBe("points");
    expect(modes.rollChest(0.9999).kind).toBe("empty");
    expect(modes.assignTeam([2, 1, 2])).toBe(1);
    const st = modes.teamStandings([{ team: 0, score: 1000 }, { team: 0, score: 0 }, { team: 1, score: 600 }], 2);
    expect(st.map((s) => [s.team, s.average])).toEqual([[1, 600], [0, 500]]);
  });

  it("savollar: bugungi yoki barcha testlardan, ochiq savolsiz va takrorsiz", async () => {
    const { group } = await seed();
    const today = await pickQuestions(group._id, "today", 20, NOW);
    expect(today.map((q) => q.prompt).sort()).toEqual(["1+1?", "2+2?"]);
    const all = await pickQuestions(group._id, "all", 20, NOW);
    expect(all).toHaveLength(4);
    expect(new Set(all.map((q) => q.prompt)).size).toBe(4);
  });
});

describe("o'yin jarayoni", () => {
  it("klassik: qo'shilish, savol, to'g'ri javob savol paytida yashirin, natija va yakunda coin", async () => {
    const { gid, mentor, ali, vali, guli } = await seed();
    const id = await create(gid, mentor, "classic", "today");
    // Guruhda ikkinchi faol o'yin ochilmaydi
    expect((await live.createLiveGameAction({ groupId: gid, mode: "survival", source: "all", count: 5 })).success && true).toBe(true);
    expect(await LiveGame.countDocuments()).toBe(1);

    for (const s of [ali, vali, guli]) {
      as(s);
      expect((await live.getMyActiveLiveGameAction())?.id).toBe(id);
      expect((await live.joinLiveGameAction(id)).success).toBe(true);
    }

    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.correctAnswers).toEqual([]);
    expect(st.success && st.data.question?.options).toHaveLength(3);

    const ok = await correctOf(id);
    tick(1000);
    expect((await live.answerLiveQuestionAction(id, 0, ok)).success).toBe(true);
    expect((await live.answerLiveQuestionAction(id, 0, ok)).success).toBe(false); // ikkinchi marta yo'q
    as(vali);
    tick(4000);
    await live.answerLiveQuestionAction(id, 0, ok);
    as(guli);
    await live.answerLiveQuestionAction(id, 0, "xato");

    as(mentor);
    await live.revealLiveQuestionAction(id);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.players.map((p) => p.name)).toEqual(["ALI", "VALI", "GULI"]);
    expect(host.success && host.data.correctAnswers).toEqual([ok]);
    // Reyting animatsiyasi uchun o'rinlar saqlanadi
    expect(host.success && host.data.players.map((p) => [p.name, p.rank, p.prevRank])).toEqual([
      ["ALI", 1, 0],
      ["VALI", 2, 0],
      ["GULI", 3, 0],
    ]);

    // 2-savol: faqat Guli javob beradi va Valini quvib o'tadi
    await live.startLiveQuestionAction(id);
    as(guli);
    tick(500);
    await live.answerLiveQuestionAction(id, 1, await correctOf(id));
    as(mentor);
    await live.revealLiveQuestionAction(id);
    const host2 = await live.getLiveHostStateAction(id);
    expect(host2.success && host2.data.players.find((p) => p.name === "GULI")).toMatchObject({ prevRank: 3 });
    expect(host2.success && host2.data.players.find((p) => p.name === "GULI")!.rank).toBeLessThan(3);
    const fin = await live.startLiveQuestionAction(id);
    expect(fin.success && fin.data.finished).toBe(true);

    const coins = async (u: { _id: import("mongoose").Types.ObjectId }) => (await CoinLedger.find({ studentId: u._id, idempotencyKey: /^live:/ }).lean()).map((l) => l.amount);
    // Guli 2-savolda tez javob berib birinchi o'ringa chiqdi: 1–3 o'rinlar 30 / 20 / 10
    expect([...(await coins(guli)), ...(await coins(ali)), ...(await coins(vali))]).toEqual([30, 20, 10]);
    as(ali);
    expect(await live.getMyActiveLiveGameAction()).toBeNull();
  });

  it("savol davomida javob natijasi yashirin: ochko, o'rin va seriya natija ochilgach ko'rinadi", async () => {
    const { gid, mentor, ali, vali } = await seed();
    const id = await create(gid, mentor, "survival");
    for (const s of [ali, vali]) {
      as(s);
      await live.joinLiveGameAction(id);
    }
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    tick(1000);
    await live.answerLiveQuestionAction(id, 0, await correctOf(id));
    as(vali);
    await live.answerLiveQuestionAction(id, 0, "xato");

    as(ali);
    const during = await live.getLivePlayerStateAction(id);
    expect(during.success && during.data.me).toMatchObject({ score: 0, streak: 0, answered: true, lastCorrect: null, lastPoints: 0 });
    as(vali);
    const valiDuring = await live.getLivePlayerStateAction(id);
    expect(valiDuring.success && valiDuring.data.me).toMatchObject({ score: 0, lives: 3 }); // jon hali ketmagan ko'rinadi

    as(mentor);
    await live.revealLiveQuestionAction(id);
    as(ali);
    const after = await live.getLivePlayerStateAction(id);
    expect(after.success && after.data.me?.score).toBeGreaterThan(0);
    expect(after.success && after.data.me).toMatchObject({ streak: 1, lastCorrect: true, rank: 1 });
    as(vali);
    const valiAfter = await live.getLivePlayerStateAction(id);
    expect(valiAfter.success && valiAfter.data.me?.lives).toBe(2);
  });

  it("vaqt tugagach javob qabul qilinmaydi; boshqa guruh qo'shila olmaydi", async () => {
    const { gid, mentor, ali, begona } = await seed();
    const id = await create(gid, mentor, "classic");
    as(begona);
    expect((await live.joinLiveGameAction(id)).success).toBe(false);
    expect(await live.getMyActiveLiveGameAction()).toBeNull();
    as(ali);
    await live.joinLiveGameAction(id);
    as(mentor);
    await live.startLiveQuestionAction(id);
    tick(12_000);
    as(ali);
    expect((await live.answerLiveQuestionAction(id, 0, await correctOf(id))).success).toBe(false);
  });

  it("omon qolish: javob bermagan ham jon yo'qotadi, 3 xatoda chiqadi va javob bera olmaydi", async () => {
    const { gid, mentor, ali } = await seed();
    const id = await create(gid, mentor, "survival");
    as(ali);
    await live.joinLiveGameAction(id);
    for (let i = 0; i < 3; i++) {
      as(mentor);
      await live.startLiveQuestionAction(id);
      await live.revealLiveQuestionAction(id);
    }
    const p = await LiveGamePlayer.findOne({ studentId: ali._id }).lean();
    expect(p).toMatchObject({ lives: 0, eliminated: true, eliminatedAt: 2 });
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    expect((await live.answerLiveQuestionAction(id, 3, await correctOf(id))).success).toBe(false);
  });

  it("xazina: to'g'ri javob sandiq beradi; sandiq bir marta ochiladi; o'g'irlash va qalqon", async () => {
    const { gid, mentor, ali, vali } = await seed();
    const id = await create(gid, mentor, "chest");
    for (const s of [ali, vali]) {
      as(s);
      await live.joinLiveGameAction(id);
    }
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    await live.answerLiveQuestionAction(id, 0, await correctOf(id));
    expect(await LiveGamePlayer.findOne({ studentId: ali._id }).lean()).toMatchObject({ score: 300, chests: 1 });
    expect((await live.openLiveChestAction(id)).success).toBe(true);
    expect((await live.openLiveChestAction(id)).success).toBe(false);

    // O'g'irlash: rng ni o'g'irlash oralig'iga qo'yamiz
    await LiveGamePlayer.updateOne({ studentId: vali._id }, { $set: { score: 1000, shield: false } });
    await LiveGamePlayer.updateOne({ studentId: ali._id }, { $set: { score: 0, chests: 1 } });
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.8);
    const steal = await live.openLiveChestAction(id);
    expect(steal.success && steal.data.kind).toBe("steal");
    expect((await LiveGamePlayer.findOne({ studentId: vali._id }).lean())?.score).toBe(850);
    expect((await LiveGamePlayer.findOne({ studentId: ali._id }).lean())?.score).toBe(150);

    await LiveGamePlayer.updateOne({ studentId: vali._id }, { $set: { shield: true } });
    await LiveGamePlayer.updateOne({ studentId: ali._id }, { $set: { chests: 1 } });
    await live.openLiveChestAction(id);
    spy.mockRestore();
    expect(await LiveGamePlayer.findOne({ studentId: vali._id }).lean()).toMatchObject({ score: 850, shield: false });
  });

  it("jamoaviy: jamoalarga taqsimlanadi, g'olib jamoaning har a'zosi 1-o'rin coinini oladi", async () => {
    const { gid, mentor, ali, vali, guli } = await seed();
    const id = await create(gid, mentor, "team", "all", 2);
    for (const s of [ali, vali, guli]) {
      as(s);
      await live.joinLiveGameAction(id);
    }
    const teams = (await LiveGamePlayer.find({}).sort({ createdAt: 1 }).lean()).map((p) => p.team);
    expect(teams).toEqual([0, 1, 0]);
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(vali); // yolg'iz o'zi 1-jamoa: o'rtacha yuqori
    await live.answerLiveQuestionAction(id, 0, await correctOf(id));
    as(mentor);
    await live.revealLiveQuestionAction(id);
    await live.finishLiveGameAction(id);
    expect((await CoinLedger.find({ idempotencyKey: /^live:/ }).lean()).map((l) => [String(l.studentId), l.amount])).toEqual([[String(vali._id), 30]]);
  });

  it("yopilmay qolgan o'yin 3 soatdan keyin yakunlanadi", async () => {
    const { gid, mentor } = await seed();
    await create(gid, mentor, "classic");
    expect(await finishStaleLiveGames(new Date(NOW.getTime() + 2 * 3600_000))).toBe(0);
    expect(await finishStaleLiveGames(new Date(NOW.getTime() + 4 * 3600_000))).toBe(1);
    expect((await LiveGame.findOne().lean())?.status).toBe("finished");
  });
});
