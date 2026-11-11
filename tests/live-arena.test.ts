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
const { ARENA_TOTAL_DRONES } = await import("@/lib/live-game/arena-engine");

const NOW = new Date("2026-11-10T16:40:00+05:00");
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
type U = Parameters<typeof sessionFor>[0];
const as = (u: U) => actAs(sessionFor(u));

async function seed(arena = true) {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9 });
  const mk = (login: string) => User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId: group._id });
  const [ali, vali] = await Promise.all([mk("ali"), mk("vali")]);
  const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Dars", isPublished: true, date: NOW });
  await Quiz.create({
    lessonId: lesson._id,
    title: "Test",
    isPublished: true,
    questions: [0, 1].map((i) => ({ type: "single_choice" as const, prompt: `${i}?`, options: [`ok${i}`, "x"], correctAnswers: [`ok${i}`], points: 1, timeLimit: 10 })),
  });
  as(mentor);
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 5, minigames: false, arena });
  if (!res.success) throw new Error(res.error);
  const id = res.data.gameId;
  for (const s of [ali, vali]) {
    as(s);
    await live.joinLiveGameAction(id);
  }
  // Ikki savol: Ali ikkalasiga to'g'ri, Vali — hech biriga
  for (let i = 0; i < 2; i++) {
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    const g = (await LiveGame.findById(id).lean())!;
    await live.answerLiveQuestionAction(id, i, g.questions[i].correctAnswers[0]);
    as(mentor);
    await live.revealLiveQuestionAction(id);
  }
  return { mentor, ali, vali, id };
}

const player = async (u: { _id: import("mongoose").Types.ObjectId }) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())!;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("arena bosqichi", () => {
  it("oxirgi savoldan keyin boshlanadi; yuklama to'g'ri javoblardan; natija chegaralanadi; bonus bir marta; keyin g'oliblar", async () => {
    const { mentor, ali, vali, id } = await seed();
    const before = (await player(ali)).score;
    as(mentor);
    expect((await live.getLiveHostStateAction(id)).success && true).toBe(true);
    const r = await live.startLiveQuestionAction(id);
    expect(r.success && r.data.finished).toBe(false);
    expect((await LiveGame.findById(id).lean())?.status).toBe("arena");
    expect((await player(ali)).arena).toMatchObject({ ammo: 49, armor: 30 });
    expect((await player(vali)).arena).toMatchObject({ ammo: 25, armor: 0 });

    tick(5000); // sanoq tugadi
    as(ali);
    await live.reportArenaAction(id, { kills: 999, waves: 9, finished: true, dead: false }, false);
    expect((await player(ali)).arena).toMatchObject({ kills: ARENA_TOTAL_DRONES, waves: 3, finished: true });
    // Kamroq natija oldingisini kamaytirmaydi
    await live.reportArenaAction(id, { kills: 1, waves: 0, finished: false, dead: false }, true);
    expect((await player(ali)).arena?.kills).toBe(ARENA_TOTAL_DRONES);
    as(vali);
    const rep = await live.reportArenaAction(id, { kills: 5, waves: 0, finished: true, dead: true, x: 400, y: 300, a: 1, hp: 0 }, true);
    // Javobda — hammaning joylashuvi (ismi bilan) va guruh jami
    expect(rep.success && rep.data.peers.map((p) => [p.name, p.isMe]).sort()).toEqual([
      ["ALI", false],
      ["VALI", true],
    ]);
    expect(rep.success && rep.data.peers.find((p) => p.isMe)).toMatchObject({ x: 400, y: 300, hp: 0 });
    expect(rep.success && rep.data.groupKills).toBe(ARENA_TOTAL_DRONES + 5);
    expect((await player(vali)).arena).toMatchObject({ kills: 5, finished: false, dead: true });

    as(mentor);
    await live.endArenaAction(id);
    await live.endArenaAction(id);
    expect((await player(ali)).score).toBe(before + 1300);
    expect((await player(vali)).arena?.points).toBe(100);

    as(vali);
    expect((await live.reportArenaAction(id, { kills: 30, waves: 3, finished: true, dead: false }, true)).success).toBe(false);

    as(mentor);
    const fin = await live.startLiveQuestionAction(id);
    expect(fin.success && fin.data.finished).toBe(true);
    expect((await LiveGame.findById(id).lean())?.status).toBe("finished");
  });

  it("arena tugatilmasdan 'Keyingi' bosilsa — avval bonus hisoblanadi, keyin yakun", async () => {
    const { mentor, ali, id } = await seed();
    as(mentor);
    await live.startLiveQuestionAction(id);
    tick(5000);
    as(ali);
    await live.reportArenaAction(id, { kills: 10, waves: 1, finished: false, dead: false }, false);
    const before = (await player(ali)).score;
    as(mentor);
    await live.startLiveQuestionAction(id);
    expect((await player(ali)).score).toBe(before + 300);
    expect((await LiveGame.findById(id).lean())?.status).toBe("finished");
  });

  it("arena o'chirilgan bo'lsa — oxirgi savoldan keyin to'g'ridan-to'g'ri g'oliblar", async () => {
    const { mentor, id } = await seed(false);
    as(mentor);
    const r = await live.startLiveQuestionAction(id);
    expect(r.success && r.data.finished).toBe(true);
  });
});
