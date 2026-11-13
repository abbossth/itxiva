import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { LiveGame } = await import("@/lib/db/models/live-game.model");
const { LiveGamePlayer } = await import("@/lib/db/models/live-game-player.model");
const live = await import("@/actions/live-game.actions");
const adv = await import("@/lib/live-game/adventures");

const NOW = new Date("2026-11-10T16:40:00+05:00");
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
type U = Parameters<typeof sessionFor>[0];
const as = (u: U) => actAs(sessionFor(u));

const P = (o: Partial<import("@/lib/live-game/adventures").AdvPlayer> & { id: string }) => ({
  name: o.id.toUpperCase(),
  slot: 0,
  score: 0,
  progress: 0,
  finished: false,
  streak: 1,
  correct: true,
  ms: 1000,
  ...o,
});
const ctx = (total = 10, cells: number[] = []) => ({ total, limitMs: 10_000, cells, rng: () => 0.5 });

describe("sarguzasht qoidalari", () => {
  it("poyga: tez javob uzoqroq, turbo, marraga birinchi yetgan bonus oladi", () => {
    const r = adv.revealAdventure("race", [P({ id: "a", ms: 0 }), P({ id: "b", ms: 9000 }), P({ id: "c", correct: false }), P({ id: "d", streak: 3, ms: 0 })], ctx());
    const by = (id: string) => r.out.find((o) => o.id === id)!;
    expect(by("a").progress).toBe(120);
    expect(by("b").progress).toBeLessThan(by("a").progress);
    expect(by("c").progress).toBe(0);
    expect(by("d").progress).toBe(145);
    const fin = adv.revealAdventure("race", [P({ id: "a", progress: 990, ms: 100 }), P({ id: "b", progress: 990, ms: 500 })], ctx());
    expect(fin.out.map((o) => [o.id, o.finished, o.score])).toEqual([
      ["a", true, 10 + 300],
      ["b", true, 10 + 200],
    ]);
    expect(fin.events[0]).toContain("A");
    // Marradagi o'yinchi endi siljimaydi
    expect(adv.revealAdventure("race", [P({ id: "a", progress: 1000, finished: true, score: 1300 })], ctx()).out[0].score).toBe(1300);
  });

  it("raketa: to'g'ri — yuqoriga, xato — pastga (noldan pastga emas), balandlik belgilari", () => {
    const r = adv.revealAdventure("rocket", [P({ id: "a", ms: 0, progress: 450, score: 450 }), P({ id: "b", correct: false, progress: 30, score: 30 })], ctx());
    expect(r.out[0]).toMatchObject({ progress: 650, score: 650 });
    expect(r.events.some((e) => e.includes("Bulutlar"))).toBe(true);
    expect(r.out[1]).toMatchObject({ progress: 0, score: 0, effect: { kind: "fall" } });
  });

  it("ko'prik: to'g'ri — qadam, xato — suvga tushib orqaga, oxirida qirg'oq", () => {
    const len = adv.bridgeLength(10);
    const r = adv.revealAdventure("bridge", [P({ id: "a", progress: 2, score: 200 }), P({ id: "b", correct: false, progress: 2, score: 200 }), P({ id: "c", progress: len - 1, score: 600 })], ctx());
    const by = (id: string) => r.out.find((o) => o.id === id)!;
    expect(by("a").progress).toBe(3);
    expect(by("b")).toMatchObject({ progress: 1, score: 100, effect: { kind: "splash" } });
    expect(by("c")).toMatchObject({ progress: len, finished: true });
  });

  it("oltin kon: tez javob — ikki marta kovlash; bomba ochkoni kamaytiradi, noldan pastga emas", () => {
    expect(adv.rollDig(() => 0)).toBe("gold");
    expect(adv.rollDig(() => 0.999)).toBe("rock");
    const fast = adv.revealAdventure("gold", [P({ id: "a", ms: 0 })], { ...ctx(), rng: () => 0 });
    expect(fast.out[0].effect.items).toEqual(["🪙", "🪙"]);
    expect(fast.out[0].score).toBe(300);
    // Bomba (vazn oralig'i: oltin 38 + xalta 22 + olmos 8 = 68 → 68..84 bomba)
    const bomb = adv.revealAdventure("gold", [P({ id: "a", ms: 9000, score: 100 })], { ...ctx(), rng: () => 0.7 });
    expect(bomb.out[0].effect.items).toEqual(["💣"]);
    expect(bomb.out[0].score).toBe(0);
  });

  it("hudud: to'g'ri javob kataklar beradi, joy qolmasa qo'shnidan tortib olinadi", () => {
    const players = [P({ id: "a", slot: 0, ms: 0, streak: 3 }), P({ id: "b", slot: 1, ms: 9000 }), P({ id: "c", slot: 2, correct: false })];
    const r = adv.revealAdventure("territory", players, ctx());
    const by = (id: string) => r.out.find((o) => o.id === id)!;
    expect(by("a").progress).toBe(3);
    expect(by("b").progress).toBe(1);
    expect(by("c").progress).toBe(0);
    expect(by("a").score).toBe(300);
    expect(r.cells.filter((c) => c === 0)).toHaveLength(3);
    // Hamma katak b niki, a ning bitta katagi bor: a qo'shnisidan tortib oladi
    const cells = adv.emptyCells().map(() => 1);
    cells[0] = 0;
    const steal = adv.revealAdventure("territory", [P({ id: "a", slot: 0, ms: 9000 }), P({ id: "b", slot: 1, correct: false, score: 14300 })], ctx(10, cells));
    expect(steal.out.find((o) => o.id === "a")!.progress).toBe(2);
    expect(steal.out.find((o) => o.id === "b")!.effect.kind).toBe("lost");
  });
});


describe("taktikalar", () => {
  it("poyga: turbo uzoqroq (xatoda orqaga), to'r oldingi robotni suradi, qalqon qaytaradi", () => {
    const r = adv.revealAdventure(
      "race",
      [
        P({ id: "a", ms: 0, tactic: "turbo" }),
        P({ id: "b", ms: 0, progress: 100, score: 100 }),
        P({ id: "c", ms: 0, tactic: "zap", target: "b" }),
        P({ id: "d", correct: false, tactic: "turbo", progress: 50, score: 50 }),
      ],
      ctx()
    );
    const by = (id: string) => r.out.find((o) => o.id === id)!;
    expect(by("a").progress).toBe(168);
    expect(by("c").progress).toBe(96);
    expect(by("b").progress).toBe(220 - 50);
    expect(by("b").score).toBe(220 - 50);
    expect(by("b").effect.items).toContain("⚡");
    expect(by("d")).toMatchObject({ progress: 20, score: 20 });
    expect(r.events.some((e) => e.includes("orqaga surdi"))).toBe(true);
    // Qalqon to'rni qaytaradi
    const sh = adv.revealAdventure("race", [P({ id: "b", ms: 0, progress: 100, tactic: "shield" }), P({ id: "c", ms: 0, tactic: "zap", target: "b" })], ctx());
    expect(sh.out.find((o) => o.id === "b")!.progress).toBe(100 + 102);
    expect(sh.events[0]).toContain("qalqoni");
    // Xato javob bilan to'r ishlamaydi
    const miss = adv.revealAdventure("race", [P({ id: "b", ms: 0, progress: 100 }), P({ id: "c", correct: false, tactic: "zap", target: "b" })], ctx());
    expect(miss.out.find((o) => o.id === "b")!.progress).toBe(220);
  });

  it("raketa: forsaj baland, xatoda qattiq qulaydi; ehtiyotkor sekin, kam yo'qotadi", () => {
    const r = adv.revealAdventure(
      "rocket",
      [P({ id: "a", ms: 0, tactic: "boost" }), P({ id: "b", ms: 0, tactic: "careful" }), P({ id: "c", correct: false, tactic: "boost", progress: 500, score: 500 }), P({ id: "d", correct: false, tactic: "careful", progress: 500, score: 500 })],
      ctx()
    );
    const by = (id: string) => r.out.find((o) => o.id === id)!;
    expect(by("a").progress).toBe(340);
    expect(by("b").progress).toBe(140);
    expect(by("c").progress).toBe(300);
    expect(by("d").progress).toBe(480);
  });

  it("ko'prik: yoriq taxta — joyida qoladi va hammaga ochiladi; mustahkam taxta ham belgilanadi", () => {
    const cracks = [1, 0, 2, 0, 0, 0];
    const r = adv.revealAdventure("bridge", [P({ id: "a", tactic: "1" }), P({ id: "b", tactic: "2" }), P({ id: "c", correct: false, tactic: "1", progress: 1, score: 100 })], { ...ctx(), cracks, known: [] });
    const by = (id: string) => r.out.find((o) => o.id === id)!;
    expect(by("a")).toMatchObject({ progress: 0, score: 50, effect: { kind: "crack" } });
    expect(by("b").progress).toBe(1);
    expect(by("c")).toMatchObject({ progress: 0, effect: { kind: "splash" } });
    expect(r.known?.[0]).toBe(0b110);
  });

  it("oltin kon: yuza qatlamda bomba yo'q, chuqurda olmos ko'p", () => {
    for (let i = 0; i < 50; i++) expect(adv.rollDig(() => i / 50, "shallow")).not.toBe("bomb");
    const deep = Array.from({ length: 100 }, (_, i) => adv.rollDig(() => i / 100, "deep"));
    expect(deep.filter((k) => k === "diamond").length).toBe(30);
    const r = adv.revealAdventure("gold", [P({ id: "a", ms: 9000, tactic: "deep", score: 500 })], { ...ctx(), rng: () => 0.6 });
    expect(r.out[0]).toMatchObject({ score: 250, effect: { items: ["💣"] } });
  });

  it("hudud: hujum tanlangan qo'shnidan oladi, mudofaa hujumni qaytaradi", () => {
    const cells = adv.emptyCells().map(() => 1);
    cells[0] = 0;
    const atk = adv.revealAdventure("territory", [P({ id: "a", slot: 0, ms: 9000, tactic: "attack", target: "1" }), P({ id: "b", slot: 1, correct: false, score: 14300 })], ctx(10, cells));
    expect(atk.out.find((o) => o.id === "a")!.progress).toBe(3);
    const def = adv.revealAdventure("territory", [P({ id: "a", slot: 0, ms: 9000, tactic: "attack", target: "1" }), P({ id: "b", slot: 1, ms: 9000, tactic: "defend", score: 14300 })], ctx(10, cells));
    // Hujum qaytarildi: b birorta katak yo'qotmadi (o'zi esa +1 katak oldi)
    expect(def.out.find((o) => o.id === "a")!.effect.text).toContain("qal'asiga");
    expect(def.out.find((o) => o.id === "b")!).toMatchObject({ progress: adv.GRID_W * adv.GRID_H, effect: { kind: "defend" } });
    expect(def.events.some((e) => e.includes("qaytardi"))).toBe(true);
    expect(adv.borderRivals(cells, 0)).toEqual([1]);
  });
});

async function seed(mode: "race" | "territory" | "arena" | "rocket" | "bridge", count = 5) {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9 });
  const mk = (login: string) => User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId: group._id });
  const ali = await mk("ali");
  const vali = await mk("vali");
  const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Dars", isPublished: true, date: NOW });
  await Quiz.create({
    lessonId: lesson._id,
    title: "Test",
    isPublished: true,
    questions: Array.from({ length: count }, (_, i) => ({ type: "single_choice" as const, prompt: `${i}?`, options: [`ok${i}`, "x"], correctAnswers: [`ok${i}`], points: 1, timeLimit: 10 })),
  });
  as(mentor);
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode, source: "all", count: 5, minigames: true });
  if (!res.success) throw new Error(res.error);
  const id = res.data.gameId;
  for (const s of [ali, vali]) {
    as(s);
    await live.joinLiveGameAction(id);
  }
  return { mentor, ali, vali, id };
}

const player = async (u: { _id: import("mongoose").Types.ObjectId }) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())!;

/** Bitta savol: Ali to'g'ri (tez), Vali xato */
async function round(id: string, mentor: U, ali: U, vali: U) {
  as(mentor);
  await live.startLiveQuestionAction(id);
  const g = (await LiveGame.findById(id).lean())!;
  as(ali);
  await live.answerLiveQuestionAction(id, g.index, g.questions[g.index].correctAnswers[0]);
  as(vali);
  await live.answerLiveQuestionAction(id, g.index, "x");
  as(mentor);
  await live.revealLiveQuestionAction(id);
  return g.index;
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("sarguzasht rejimlari (server)", () => {
  it("poyga: javob paytida ochko yo'q, natijada masofa va ta'sir; o'quvchiga natijadan keyin ko'rinadi", async () => {
    const { mentor, ali, vali, id } = await seed("race");
    as(mentor);
    await live.startLiveQuestionAction(id);
    const g = (await LiveGame.findById(id).lean())!;
    as(ali);
    await live.answerLiveQuestionAction(id, 0, g.questions[0].correctAnswers[0]);
    expect((await player(ali)).score).toBe(0);
    const during = await live.getLivePlayerStateAction(id);
    expect(during.success && during.data.me?.effect).toBe(null);
    as(mentor);
    await live.revealLiveQuestionAction(id);
    const a = await player(ali);
    expect(a.progress).toBeGreaterThanOrEqual(110);
    expect(a.score).toBe(a.progress);
    expect(a.answers[0].points).toBe(a.progress);
    expect((await player(vali)).effect).toMatchObject({ kind: "stall", index: 0 });
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.me?.effect?.kind).toBe("move");
    expect(st.success && st.data.goal).toBe(adv.raceFinish(5));
    as(mentor);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.players[0].effect?.kind).toBe("move");
    expect(host.success && host.data.slots).toHaveLength(2);
  });

  it("taktika: faqat javobdan keyin, natija ochilguncha; natijada qo'llanadi", async () => {
    const { mentor, ali, vali, id } = await seed("rocket");
    as(mentor);
    await live.startLiveQuestionAction(id);
    const g = (await LiveGame.findById(id).lean())!;
    as(ali);
    expect((await live.chooseLiveTacticAction(id, 0, "boost")).success).toBe(false);
    await live.answerLiveQuestionAction(id, 0, g.questions[0].correctAnswers[0]);
    expect((await live.chooseLiveTacticAction(id, 0, "hack")).success).toBe(false);
    expect((await live.chooseLiveTacticAction(id, 0, "careful")).success).toBe(true);
    expect((await live.chooseLiveTacticAction(id, 0, "boost")).success).toBe(true);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.tactics?.picked).toBe("boost");
    as(vali);
    await live.answerLiveQuestionAction(id, 0, "x");
    await live.chooseLiveTacticAction(id, 0, "boost");
    as(mentor);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.players.filter((p) => p.tactic === "boost")).toHaveLength(2);
    await live.revealLiveQuestionAction(id);
    expect((await player(ali)).progress).toBeGreaterThanOrEqual(300);
    expect((await player(vali)).effect).toMatchObject({ kind: "fall" });
    as(ali);
    expect((await live.chooseLiveTacticAction(id, 0, "steady")).success).toBe(false);
  });

  it("ko'prik: yoriqlar yashirin, bosilgani ochiladi", async () => {
    const { mentor, ali, vali, id } = await seed("bridge");
    const g0 = (await LiveGame.findById(id).lean())!;
    expect(g0.cracks).toHaveLength(adv.bridgeLength(5));
    const crack = g0.cracks![0];
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.tactics?.plank).toEqual({ known: 0, broken: 0 });
    await live.answerLiveQuestionAction(id, 0, g0.questions[0].correctAnswers[0]);
    await live.chooseLiveTacticAction(id, 0, String(crack));
    as(vali);
    await live.answerLiveQuestionAction(id, 0, g0.questions[0].correctAnswers[0]);
    await live.chooseLiveTacticAction(id, 0, String((crack + 1) % 3));
    as(mentor);
    await live.revealLiveQuestionAction(id);
    expect((await player(ali)).progress).toBe(0);
    expect((await player(vali)).progress).toBe(1);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.planks[0]).toEqual({ known: (1 << crack) | (1 << ((crack + 1) % 3)), broken: 1 << crack });
    // Keyingi qadamning yoriqlari ochilmagan
    expect(host.success && host.data.planks[1]).toEqual({ known: 0, broken: 0 });
  });

  it("hudud: xarita o'yinda saqlanadi, ochko — katak × 100", async () => {
    const { mentor, ali, vali, id } = await seed("territory");
    await round(id, mentor, ali, vali);
    const g = (await LiveGame.findById(id).lean())!;
    expect(g.cells).toHaveLength(adv.GRID_W * adv.GRID_H);
    const mine = g.cells.filter((c) => c === 0).length;
    expect(mine).toBeGreaterThanOrEqual(2);
    expect((await player(ali)).score).toBe(mine * 100);
    expect((await player(vali)).score).toBe(0);
  });

  it("kiber arena rejimi: har 3 savoldan keyin qisqa jang, keyin savol davom etadi, oxirida final jang", async () => {
    const { mentor, ali, vali, id } = await seed("arena", 5);
    expect((await LiveGame.findById(id).lean())?.options).toMatchObject({ minigames: false, arena: true });
    for (let i = 0; i < 3; i++) await round(id, mentor, ali, vali);
    as(mentor);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.arenaRoundNext).toBe(true);
    await live.startLiveQuestionAction(id);
    let g = (await LiveGame.findById(id).lean())!;
    expect(g.status).toBe("arena");
    expect(g.arena?.round).toBe(2);
    // Avval xarita uchun ovoz: hali qahramonlar yo'q
    expect(g.arena?.voteEndsAt).toBeTruthy();
    expect((await player(ali)).arena ?? null).toBe(null);
    await live.resolveArenaVoteAction(id);
    g = (await LiveGame.findById(id).lean())!;
    expect(g.arena?.map).toBeTruthy();
    expect(new Date(g.arena!.endsAt).getTime() - new Date(g.arena!.startedAt).getTime()).toBe(45_000);
    expect((await player(ali)).arena?.lives).toBe(4);
    // Jangdan keyin "Keyingi" — 4-savol (oraliq jang bonusi yarim)
    const before = (await player(ali)).score;
    await live.startLiveQuestionAction(id);
    g = (await LiveGame.findById(id).lean())!;
    expect(g.status).toBe("question");
    expect(g.index).toBe(3);
    expect((await player(ali)).score).toBe(before + 150);
    as(ali);
    await live.answerLiveQuestionAction(id, 3, g.questions[3].correctAnswers[0]);
    as(mentor);
    await live.revealLiveQuestionAction(id);
    await round(id, mentor, ali, vali);
    // Oxirgi savoldan keyin — final jang (2 daqiqa), keyin g'oliblar
    as(mentor);
    await live.startLiveQuestionAction(id);
    g = (await LiveGame.findById(id).lean())!;
    expect(g.status).toBe("arena");
    expect(g.arena?.round).toBe(4);
    expect(g.arenaRounds).toEqual([2, 4]);
    const fin = await live.startLiveQuestionAction(id);
    expect(fin.success && fin.data.finished).toBe(true);
  });

  it("intro: faqat kutish zalida, proyektor va o'quvchiga qolgan vaqt", async () => {
    const { mentor, ali, id } = await seed("rocket");
    as(mentor);
    const r = await live.startLiveIntroAction(id);
    expect(r.success && r.data.introMs).toBe(adv.INTRO_MS);
    tick(1000);
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.introMs).toBe(adv.INTRO_MS - 1000);
    tick(adv.INTRO_MS);
    const later = await live.getLivePlayerStateAction(id);
    expect(later.success && later.data.introMs).toBe(0);
    as(mentor);
    await live.startLiveQuestionAction(id);
    expect((await live.startLiveIntroAction(id)).success).toBe(false);
  });
});
