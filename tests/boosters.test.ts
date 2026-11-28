import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { LiveGame } = await import("@/lib/db/models/live-game.model");
const { LiveGamePlayer } = await import("@/lib/db/models/live-game-player.model");
const live = await import("@/actions/live-game.actions");
const boost = await import("@/actions/booster.actions");
const modes = await import("@/lib/live-game/modes");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);
afterEach(() => vi.restoreAllMocks());

async function seed(mode: "classic" | "survival") {
  const mentor = await User.create({ login: "u", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "8-A", grade: 8 });
  const ali = await User.create({ login: "ali", fullName: "Ali", role: "student", passwordHash: "x", groupId: group._id, spendableBalance: 200, totalCoins: 200 });
  const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "D", isPublished: true, date: new Date() });
  await Quiz.create({
    lessonId: lesson._id,
    title: "T",
    isPublished: true,
    questions: Array.from({ length: 3 }, (_, i) => ({ type: "single_choice", prompt: `${i}?`, options: ["to'g'ri", "a", "b", "c"], correctAnswers: ["to'g'ri"], points: 1, timeLimit: 20 })),
  });
  actAs(sessionFor(mentor));
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode, source: "all", count: 5, minigames: false });
  if (!res.success) throw new Error(res.error);
  const id = res.data.gameId;
  actAs(sessionFor(ali));
  await live.joinLiveGameAction(id);
  actAs(sessionFor(mentor));
  await live.startLiveQuestionAction(id);
  actAs(sessionFor(ali));
  return { mentor, ali, id };
}

describe("qalqon (sof qoida)", () => {
  it("omon qolishda xato javobda jon ketmaydi va seriya saqlanadi — bir marta", () => {
    const p = { score: 0, streak: 3, lives: 3, eliminated: false, double: false, guard: true };
    const o = modes.scoreAnswer("survival", p, { isCorrect: false, elapsedMs: 0, limitSec: 10 });
    expect(o).toMatchObject({ lives: 3, streak: 3, guard: false });
    const o2 = modes.scoreAnswer("survival", { ...p, guard: false }, { isCorrect: false, elapsedMs: 0, limitSec: 10 });
    expect(o2).toMatchObject({ lives: 2, streak: 0 });
  });
});

describe("kuchaytirgichlar", () => {
  it("sotib olish (bir bosish — bir marta), 50/50 ikkita xato variantni beradi, ×2 ochkoni oshiradi, zaxira kamayadi", async () => {
    const { ali, id } = await seed("classic");
    expect((await boost.buyBoosterAction("fifty", 1, "nonce-1")).success).toBe(true);
    await boost.buyBoosterAction("fifty", 1, "nonce-1"); // takroriy so'rov
    const b2 = await boost.buyBoosterAction("double", 2, "nonce-2");
    expect(b2.data?.counts).toEqual({ fifty: 1, double: 2, guard: 0 });
    expect(b2.data?.balance).toBe(200 - 15 - 40);

    const g = (await LiveGame.findById(id).lean())!;
    const f = await live.applyLiveBoosterAction(id, g.index, "fifty");
    expect(f.success && f.data.hide).toHaveLength(2);
    expect(f.success && f.data.hide.includes("to'g'ri")).toBe(false);
    // Shu savolda qayta — yo'q; zaxira tugagan
    expect((await live.applyLiveBoosterAction(id, g.index, "fifty")).success).toBe(false);
    expect((await live.applyLiveBoosterAction(id, g.index, "guard")).success).toBe(false);

    expect((await live.applyLiveBoosterAction(id, g.index, "double")).success).toBe(true);
    await live.answerLiveQuestionAction(id, g.index, "to'g'ri");
    const me = (await LiveGamePlayer.findOne({ studentId: ali._id }).lean())!;
    // Tezlik ochkosi 500–1000; ×2 bilan — 1000–2000 (sekin mashinada javob kechroq hisoblanib aynan 1000 bo'lishi mumkin)
    expect(me.answers[0].points).toBeGreaterThanOrEqual(1000);
    expect(me.double).toBe(false);
    expect((await User.findById(ali._id).lean())?.boosters).toMatchObject({ fifty: 0, double: 1, guard: 0 });
  });

  it("omon qolishda qalqon xato javobdan jonni saqlaydi", async () => {
    const { ali, id } = await seed("survival");
    await boost.buyBoosterAction("guard", 1, "nonce-g");
    const g = (await LiveGame.findById(id).lean())!;
    expect((await live.applyLiveBoosterAction(id, g.index, "guard")).success).toBe(true);
    await live.answerLiveQuestionAction(id, g.index, "a");
    expect((await LiveGamePlayer.findOne({ studentId: ali._id }).lean())).toMatchObject({ lives: 3, guard: false });
  });
});
