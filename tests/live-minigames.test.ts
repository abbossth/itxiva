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
const live = await import("@/actions/live-game.actions");
const mg = await import("@/lib/live-game/minigames");
const modes = await import("@/lib/live-game/modes");

const NOW = new Date("2026-11-10T16:40:00+05:00");
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
type U = Parameters<typeof sessionFor>[0];
const as = (u: U) => actAs(sessionFor(u));

async function seed(questions = 6) {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9 });
  const mk = (login: string) => User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId: group._id });
  const [ali, vali] = await Promise.all([mk("ali"), mk("vali")]);
  const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Dars", isPublished: true, date: NOW });
  await Quiz.create({
    lessonId: lesson._id,
    title: "Test",
    isPublished: true,
    questions: Array.from({ length: questions }, (_, i) => ({
      type: "single_choice" as const,
      prompt: `${i} + ${i}?`,
      options: [String(i * 2), "x"],
      correctAnswers: [String(i * 2)],
      points: 1,
      timeLimit: 10,
    })),
  });
  as(mentor);
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 10 });
  if (!res.success) throw new Error(res.error);
  const id = res.data.gameId;
  for (const s of [ali, vali]) {
    as(s);
    await live.joinLiveGameAction(id);
  }
  as(mentor);
  return { mentor, ali, vali, id };
}

/** Mentor: savol → natija, n marta */
async function playQuestions(mentor: U, id: string, n: number) {
  as(mentor);
  for (let i = 0; i < n; i++) {
    await live.startLiveQuestionAction(id);
    await live.revealLiveQuestionAction(id);
  }
}

/** Birinchi qisqa o'yin har doim g'ildirak — boshqa turlarni sinash uchun u o'tgan deb belgilanadi */
async function skipFirstWheel(id: string) {
  await LiveGame.updateOne({ _id: id }, { $set: { minigameRounds: [-1] } });
}

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

describe("qoidalar", () => {
  it("har 3 savoldan keyin, oxirgisidan keyin emas, har round bir marta; tur takrorlanmaydi", () => {
    expect(mg.minigameDue(2, 10, [])).toBe(true);
    expect(mg.minigameDue(1, 10, [])).toBe(false);
    expect(mg.minigameDue(2, 3, [])).toBe(false);
    expect(mg.minigameDue(2, 10, [2])).toBe(false);
    for (let r = 0; r < 1; r += 0.1) expect(mg.pickMinigame("target", r)).not.toBe("target");
    // Tezkor bosish olib tashlangan — hech qachon tanlanmaydi
    for (let r = 0; r < 1; r += 0.05) expect(mg.pickMinigame(null, r)).not.toBe("tap");
  });

  it("ochko: bosish ×5 (120 gacha) va eng tezga +200, nishon ×40; katta son chegaralanadi", () => {
    const p = mg.minigamePoints("tap", [{ id: "a", value: 50 }, { id: "b", value: 200 }]);
    expect(p.get("a")).toBe(250);
    expect(p.get("b")).toBe(120 * 5 + 200);
    expect(mg.minigamePoints("target", [{ id: "a", value: 10 }]).get("a")).toBe(400);
    expect(mg.clampMinigameValue("tap", 9999)).toBe(150);
    expect(mg.clampMinigameValue("target", -3)).toBe(0);
  });

  it("yangi o'yinlar: xotira ×80, hisob va rang ×40, reaksiya — eng tezlarga o'rin bo'yicha; odam bo'lmagan tezlik hisoblanmaydi", () => {
    expect(mg.minigamePoints("memory", [{ id: "a", value: 7 }]).get("a")).toBe(560);
    expect(mg.minigamePoints("math", [{ id: "a", value: 12 }]).get("a")).toBe(480);
    expect(mg.minigamePoints("colors", [{ id: "a", value: 99 }]).get("a")).toBe(40 * 40);
    const r = mg.minigamePoints("reaction", [
      { id: "slow", value: 450 },
      { id: "fast", value: 210 },
      { id: "mid", value: 300 },
      { id: "late", value: 900 },
      { id: "none", value: 0 },
    ]);
    expect([r.get("fast"), r.get("mid"), r.get("slow"), r.get("late"), r.get("none")]).toEqual([500, 350, 250, 150, 0]);
    expect(mg.clampMinigameValue("reaction", 80)).toBe(0);
    expect(mg.clampMinigameValue("reaction", 250)).toBe(250);
    expect(mg.clampMinigameValue("wheel", 5)).toBe(0);
    expect(mg.minigameBetter("reaction", 200, 300)).toBe(true);
    expect(mg.minigameBetter("reaction", 0, 300)).toBe(false);
  });

  it("sovg'alar: quti 5–20, super baraban 5–50 (5 ga karrali); g'ildirak vaznlari jami 100", () => {
    expect(mg.WHEEL.reduce((s, w) => s + w.weight, 0)).toBe(100);
    for (let r = 0; r < 1; r += 0.01) {
      const box = mg.openBox(r);
      expect(box).toBeGreaterThanOrEqual(5);
      expect(box).toBeLessThanOrEqual(20);
      const coins = mg.SUPER_WHEEL[mg.spinSuperWheel(r)].coins;
      expect(coins % 5).toBe(0);
      expect(coins).toBeGreaterThanOrEqual(5);
      expect(coins).toBeLessThanOrEqual(50);
    }
    expect(mg.SUPER_WHEEL.map((w) => w.coins)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect(mg.prizeOf("super")).toBe("box");
    expect(mg.prizeOf("superWheel")).toBe("superWheel");
    expect(mg.prizeOf("p500")).toBeNull();
  });

  it("×2 keyingi to'g'ri javobda ishlaydi va bonus raund bilan qo'shiladi", () => {
    const p = { score: 0, streak: 0, lives: 3, eliminated: false, double: true };
    expect(modes.scoreAnswer("classic", p, { isCorrect: true, elapsedMs: 0, limitSec: 10 })).toMatchObject({ points: 2000, double: false });
    expect(modes.scoreAnswer("classic", p, { isCorrect: true, elapsedMs: 0, limitSec: 10, bonus: true }).points).toBe(4000);
    expect(modes.scoreAnswer("classic", p, { isCorrect: false, elapsedMs: 0, limitSec: 10 }).double).toBe(true);
  });
});

describe("o'yin ichida", () => {
  it("mo'ljalga otish: 3-savoldan keyin boshlanadi, natija vaqt oynasida qabul qilinadi, ochko qo'shiladi, keyin 4-savol", async () => {
    const { mentor, ali, vali, id } = await seed();
    await playQuestions(mentor, id, 3);
    await skipFirstWheel(id);
    vi.spyOn(Math, "random").mockReturnValue(0); // tur: mo'ljal
    await live.startLiveQuestionAction(id);
    let g = await LiveGame.findById(id).lean();
    expect(g).toMatchObject({ status: "minigame", minigame: { kind: "target", round: 2 } });

    as(ali);
    expect((await live.submitMinigameAction(id, 2, 10)).success).toBe(false); // sanoq paytida hali qabul qilinmaydi
    tick(3000);
    await live.submitMinigameAction(id, 2, 30);
    await live.submitMinigameAction(id, 2, 50);
    await live.submitMinigameAction(id, 2, 40); // kichigi eng kattasini kamaytirmaydi
    as(vali);
    await live.submitMinigameAction(id, 2, 20);
    tick(20_000);
    expect((await live.submitMinigameAction(id, 2, 99)).success).toBe(false); // vaqt o'tgan

    as(mentor);
    await live.endMinigameAction(id);
    await live.endMinigameAction(id); // ikkinchi marta hech narsa qo'shmaydi
    const score = async (u: { _id: import("mongoose").Types.ObjectId }) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())?.score;
    // 50 → 40 gacha cheklanadi, ochko — 30 nishongacha ×40
    expect(await score(ali)).toBe(30 * 40);
    expect(await score(vali)).toBe(20 * 40);

    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.minigame?.progress.map((p) => [p.name, p.value, p.points])).toEqual([
      ["ALI", 40, 1200],
      ["VALI", 20, 800],
    ]);

    await live.startLiveQuestionAction(id);
    g = await LiveGame.findById(id).lean();
    expect(g).toMatchObject({ status: "question", index: 3 });
  });

  it("bonus raund: keyingi savolda ochko ikki baravar", async () => {
    const { mentor, ali, id } = await seed();
    await playQuestions(mentor, id, 3);
    await skipFirstWheel(id);
    vi.spyOn(Math, "random").mockReturnValue(0.99); // tur: bonus
    await live.startLiveQuestionAction(id);
    expect((await LiveGame.findById(id).lean())?.minigame?.kind).toBe("bonus");
    vi.restoreAllMocks();
    await live.startLiveQuestionAction(id);
    const g = (await LiveGame.findById(id).lean())!;
    as(ali);
    expect((await live.getLivePlayerStateAction(id)).success && true).toBe(true);
    await live.answerLiveQuestionAction(id, 3, g.questions[3].correctAnswers[0]);
    expect((await LiveGamePlayer.findOne({ studentId: ali._id }).lean())?.answers.find((a) => a.index === 3)?.points).toBe(2000);
  });

  it("omad g'ildiragi: har kim o'z g'ildiragini aylantiradi — natija har xil, tugaganda har kimga o'ziniki qo'llanadi", async () => {
    const { mentor, ali, vali, id } = await seed();
    await playQuestions(mentor, id, 3);
    // Birinchi qisqa o'yin har doim g'ildirak; o'yinchilar uchun: 0.01 → +500, 0.5 → +100
    const spy = vi.spyOn(Math, "random").mockReturnValueOnce(0.01).mockReturnValueOnce(0.5);
    await live.startLiveQuestionAction(id);
    spy.mockRestore();
    expect((await LiveGame.findById(id).lean())?.minigame?.kind).toBe("wheel");
    const segs = await Promise.all([ali, vali].map(async (u) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())!.minigames.find((m) => m.round === 2)!.value));
    expect(new Set(segs.map((v) => mg.WHEEL[v].effect))).toEqual(new Set(["p500", "p100"]));

    // O'quvchi o'z natijasini ko'radi
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.minigame?.myValue).toBe(segs[0]);

    as(mentor);
    await live.endMinigameAction(id);
    for (const [i, u] of [ali, vali].entries()) {
      const p = (await LiveGamePlayer.findOne({ studentId: u._id }).lean())!;
      expect(p.score).toBe(mg.wheelPoints(mg.WHEEL[segs[i]].effect));
    }
  });

  it("g'ildirak: vaznli tasodif chegaralarda to'g'ri segment beradi", () => {
    expect(mg.WHEEL[mg.spinWheel(0)].effect).toBe("p500");
    expect(mg.WHEEL[mg.spinWheel(0.9999)].effect).toBe("none");
  });

  it("qisqa o'yinlar o'chirilgan bo'lsa — to'g'ridan-to'g'ri keyingi savol", async () => {
    const { mentor, id } = await seed();
    await LiveGame.updateOne({ _id: id }, { $set: { "options.minigames": false } });
    await playQuestions(mentor, id, 3);
    await live.startLiveQuestionAction(id);
    expect(await LiveGame.findById(id).lean()).toMatchObject({ status: "question", index: 3 });
  });

  it("reaksiya: eng tez (kichik) vaqt saqlanadi, 120 ms dan tezi hisoblanmaydi", async () => {
    const { mentor, ali, id } = await seed();
    await playQuestions(mentor, id, 3);
    await skipFirstWheel(id);
    // tur: reaksiya (vaznlar: target 2, memory 2, math 2, colors 2, reaction 2 → 0.6 * 15 = 9)
    vi.spyOn(Math, "random").mockReturnValue(0.6);
    await live.startLiveQuestionAction(id);
    vi.restoreAllMocks();
    expect((await LiveGame.findById(id).lean())?.minigame?.kind).toBe("reaction");
    tick(3000);
    as(ali);
    await live.submitMinigameAction(id, 2, 0);
    await live.submitMinigameAction(id, 2, 340);
    await live.submitMinigameAction(id, 2, 280);
    await live.submitMinigameAction(id, 2, 310);
    await live.submitMinigameAction(id, 2, 60);
    const p = (await LiveGamePlayer.findOne({ studentId: ali._id }).lean())!;
    expect(p.minigames.find((m) => m.round === 2)?.value).toBe(280);
    as(mentor);
    await live.endMinigameAction(id);
    expect((await LiveGamePlayer.findOne({ studentId: ali._id }).lean())?.score).toBe(500);
  });

  it("super priz: g'ildirakdan yutiladi, o'yin tugagach quti ochiladi va coin bir marta beriladi", async () => {
    const { mentor, ali, vali, id } = await seed();
    await playQuestions(mentor, id, 3);
    // ali — "super" (quti), vali — "superWheel"
    const superAt = (effect: string) => {
      let acc = 0;
      for (const w of mg.WHEEL) {
        if (w.effect === effect) return (acc + w.weight / 2) / 100;
        acc += w.weight;
      }
      throw new Error(effect);
    };
    const players = await LiveGamePlayer.find({ gameId: id }).sort({ _id: 1 }).lean();
    const order = players.map((p) => p.studentId.toString());
    const spy = vi.spyOn(Math, "random");
    for (const sid of order) spy.mockReturnValueOnce(sid === ali._id.toString() ? superAt("super") : superAt("superWheel"));
    await live.startLiveQuestionAction(id);
    spy.mockRestore();
    as(mentor);
    await live.endMinigameAction(id);

    const prizesOf = async (u: { _id: import("mongoose").Types.ObjectId }) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())?.prizes ?? [];
    expect((await prizesOf(ali)).map((p) => p.kind)).toEqual(["box"]);
    expect((await prizesOf(vali)).map((p) => p.kind)).toEqual(["superWheel"]);

    // O'yin tugamaguncha ochilmaydi
    as(ali);
    expect((await live.openLivePrizeAction(id, 2)).success).toBe(false);

    as(mentor);
    await live.finishLiveGameAction(id);
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.me?.prizes).toEqual([{ round: 2, kind: "box", coins: 0, segment: -1, opened: false }]);

    const balance = async (u: { _id: import("mongoose").Types.ObjectId }) => (await User.findById(u._id).lean())?.spendableBalance ?? 0;
    const before = await balance(ali);
    const opened = await live.openLivePrizeAction(id, 2);
    expect(opened.success).toBe(true);
    const coins = opened.success ? opened.data.coins : 0;
    expect(coins).toBeGreaterThanOrEqual(5);
    expect(coins).toBeLessThanOrEqual(20);
    expect(await balance(ali)).toBe(before + coins);
    // Qayta ochish — o'sha natija, coin ikkinchi marta berilmaydi
    const again = await live.openLivePrizeAction(id, 2);
    expect(again.success && again.data.coins).toBe(coins);
    expect(await balance(ali)).toBe(before + coins);

    as(vali);
    const wheel = await live.openLivePrizeAction(id, 2);
    expect(wheel.success && wheel.data.coins).toBe(wheel.success ? mg.SUPER_WHEEL[wheel.data.segment].coins : -1);
    // Boshqa o'quvchining sovg'asini ocholmaydi (o'ziniki bo'lmagan round)
    expect((await live.openLivePrizeAction(id, 5)).success).toBe(false);
  });
});
