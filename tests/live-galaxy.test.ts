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
const gx = await import("@/lib/live-game/galaxy");
const server = await import("@/lib/live-game/galaxy-server");

const NOW = new Date("2026-11-17T16:40:00+05:00");
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
type U = Parameters<typeof sessionFor>[0];
const as = (u: U) => actAs(sessionFor(u));

async function seed(questions = 6) {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "8.10", grade: 8 });
  const mk = (login: string) => User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId: group._id });
  const [ali, vali] = await Promise.all([mk("ali"), mk("vali")]);
  const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "Dars", isPublished: true, date: NOW });
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
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "galaxy", source: "all", count: 10 });
  if (!res.success) throw new Error(res.error);
  const id = res.data.gameId;
  for (const s of [ali, vali]) {
    as(s);
    await live.joinLiveGameAction(id);
  }
  as(mentor);
  return { mentor, ali, vali, id };
}

/** Savol → (ali to'g'ri javob beradi) → natija */
async function play(mentor: U, ali: U, id: string, n: number) {
  for (let i = 0; i < n; i++) {
    as(mentor);
    await live.startLiveQuestionAction(id);
    const g = (await LiveGame.findById(id).lean())!;
    as(ali);
    await live.answerLiveQuestionAction(id, g.index, g.questions[g.index].correctAnswers[0]);
    as(mentor);
    await live.revealLiveQuestionAction(id);
  }
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

describe("trassa va qoidalar", () => {
  it("trassa urug'dan bir xil yasaladi, har qatorda o'tish joyi qoladi", () => {
    const a = gx.galaxyTrack(42);
    expect(gx.galaxyTrack(42)).toEqual(a);
    expect(gx.galaxyTrack(43)).not.toEqual(a);
    expect(a.every((i, k) => k === 0 || a[k - 1].z <= i.z)).toBe(true);
    expect(a.some((i) => i.kind === "rock") && a.some((i) => i.kind === "orb")).toBe(true);
    expect(a.every((i) => i.x >= -1 && i.x <= 1)).toBe(true);
  });

  it("turbo to'g'ri javobga, ochko o'ringa bog'liq; final ikki baravar", () => {
    expect(gx.galaxyTurbo(0, false)).toBe(1);
    expect(gx.galaxyTurbo(3, false)).toBe(4);
    expect(gx.galaxyTurbo(9, true)).toBe(5);
    expect(gx.galaxyPoints(1, 10, false)).toBe(700 + 150);
    expect(gx.galaxyPoints(5, 0, false)).toBe(310);
    expect(gx.galaxyPoints(40, 0, false)).toBe(100);
    expect(gx.galaxyPoints(2, 0, true)).toBe(1000);
  });
});

describe("o'yin ichida", () => {
  it("3-savoldan keyin poyga: masofa vaqtga nisbatan cheklanadi, tugaganda o'ringa qarab ochko; oxirida final", async () => {
    const { mentor, ali, vali, id } = await seed();
    await play(mentor, ali, id, 3);
    as(mentor);
    await live.startLiveQuestionAction(id);
    let g = (await LiveGame.findById(id).lean())!;
    expect(g).toMatchObject({ status: "galaxy", galaxy: { round: 2, final: false } });
    const pl = async (u: { _id: import("mongoose").Types.ObjectId }) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())!;
    // Ali 3 ta to'g'ri javob — 4 turbo, Vali — 1
    expect((await pl(ali)).galaxy?.turbo).toBe(4);
    expect((await pl(vali)).galaxy?.turbo).toBe(1);

    tick(gx.GALAXY_INTRO_S * 1000 + 10_000);
    const game = (await server.loadGalaxyGame(id))!;
    // 10 soniyada 5000 m uchib bo'lmaydi — cheklanadi
    const r1 = await server.galaxyTick(game, ali._id.toString(), { round: 2, d: 5000, x: 0.4, orbs: 7 });
    expect((await pl(ali)).galaxy?.d).toBe(10 * gx.MAX_SPEED_CHECK + 20);
    expect(r1?.peers.map((p) => p[1])).toEqual(["VALI"]);
    await server.galaxyTick(game, vali._id.toString(), { round: 2, d: 300, x: -0.2, orbs: 2 });
    // Orqaga ketmaydi
    await server.galaxyTick(game, vali._id.toString(), { round: 2, d: 100, x: 0, orbs: 1 });
    expect((await pl(vali)).galaxy).toMatchObject({ d: 300, orbs: 2, x: 0 });
    const r2 = await server.galaxyTick(game, vali._id.toString(), { round: 2, d: 320, x: 0, orbs: 2 });
    expect(r2?.place).toBe(2);

    // O'quvchi holatida poyga ko'rinadi
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.galaxy).toMatchObject({ round: 2, joined: true, turbo: 4, total: 2 });

    tick(gx.GALAXY_SECONDS * 1000);
    as(mentor);
    expect((await live.endGalaxyAction(id)).success).toBe(true);
    expect((await live.endGalaxyAction(id)).success && true).toBe(true);
    const aliAfter = await pl(ali);
    const valiAfter = await pl(vali);
    expect(aliAfter.galaxy).toMatchObject({ place: 1, points: gx.galaxyPoints(1, 7, false) });
    expect(valiAfter.galaxy).toMatchObject({ place: 2, points: gx.galaxyPoints(2, 2, false) });
    // Ikkinchi marta yakunlash ochko qo'shmaydi
    const aliScore = aliAfter.score;
    await live.endGalaxyAction(id);
    expect((await pl(ali)).score).toBe(aliScore);

    // Poyga tugagach yozish ta'sir qilmaydi
    await server.galaxyTick((await server.loadGalaxyGame(id))!, vali._id.toString(), { round: 2, d: 2000, x: 0, orbs: 50 });
    expect((await pl(vali)).galaxy?.d).toBe(320);

    // Keyingi savollar, oxirida final poyga
    await play(mentor, ali, id, 3);
    as(mentor);
    await live.startLiveQuestionAction(id);
    g = (await LiveGame.findById(id).lean())!;
    expect(g).toMatchObject({ status: "galaxy", galaxy: { round: 5, final: true } });
    tick(gx.GALAXY_INTRO_S * 1000 + gx.GALAXY_FINAL_SECONDS * 1000);
    await live.startLiveQuestionAction(id); // poyga yakunlanadi va o'yin tugaydi
    expect((await LiveGame.findById(id).lean())?.status).toBe("finished");
  });

  it("boshqa guruh yoki poygada yo'q o'quvchi yozolmaydi", async () => {
    const { mentor, ali, id } = await seed();
    await play(mentor, ali, id, 3);
    as(mentor);
    await live.startLiveQuestionAction(id);
    const outsider = await User.create({ login: "begona", fullName: "Begona", role: "student", passwordHash: "x" });
    tick(6000);
    expect(await server.galaxyTick((await server.loadGalaxyGame(id))!, outsider._id.toString(), { round: 2, d: 10 })).toBeNull();
  });
});
