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
const zn = await import("@/lib/live-game/zone");
const server = await import("@/lib/live-game/zone-server");

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
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "zone", source: "all", count: 10 });
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

describe("qoidalar", () => {
  it("to'lqinlar urug'dan, zona kichrayadi va maydon ichida; final — 5 to'lqin", () => {
    const w = zn.zoneWaves(7, false);
    expect(zn.zoneWaves(7, false)).toEqual(w);
    expect(w).toHaveLength(3);
    expect(zn.zoneWaves(7, true)).toHaveLength(5);
    expect(w[0].r).toBeGreaterThan(w[1].r);
    for (const z of w) {
      expect(z.cx - z.r).toBeGreaterThanOrEqual(0);
      expect(z.cx + z.r).toBeLessThanOrEqual(zn.FIELD.w);
      expect(z.stars).toHaveLength(6);
    }
    const start = 1000;
    expect(zn.zonePhase(start, 500, 3)).toMatchObject({ wave: -1 });
    expect(zn.zonePhase(start, start + 100, 3)).toMatchObject({ wave: 0, lock: false });
    expect(zn.zonePhase(start, start + zn.WAVE_MS + 10, 3)).toMatchObject({ wave: 0, lock: true });
    expect(zn.zonePhase(start, start + 3 * (zn.WAVE_MS + zn.LOCK_MS) + 1, 3)).toMatchObject({ done: true });
    expect(zn.zonePoints(3, 3, 2, false)).toBe(3 * 150 + 300 + 60);
    expect(zn.zonePoints(1, 3, 0, true)).toBe(300);
    expect(zn.zoneSpeed(0)).toBe(15);
    expect(zn.zoneSpeed(9)).toBe(23);
  });
});

describe("o'yin ichida", () => {
  it("3-savoldan keyin raund: sakrab bo'lmaydi, zonadan tashqaridagi robot o'chadi, ochko omon qolishga qarab; oxirida final", async () => {
    const { mentor, ali, vali, id } = await seed();
    await play(mentor, ali, id, 3);
    as(mentor);
    await live.startLiveQuestionAction(id);
    const g = (await LiveGame.findById(id).lean())!;
    expect(g).toMatchObject({ status: "zone", zone: { round: 2, final: false, resolved: 0 } });
    const waves = zn.zoneWaves(g.zone!.seed, false);
    const pl = async (u: { _id: import("mongoose").Types.ObjectId }) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())!;
    expect((await pl(ali)).zone?.speed).toBe(zn.zoneSpeed(3));
    expect((await pl(vali)).zone?.speed).toBe(zn.zoneSpeed(0));

    // Sanoq paytida yurib bo'lmaydi
    let game = (await server.loadZoneGame(id))!;
    const startX = (await pl(ali)).zone!.x;
    await server.zoneTick(game, ali._id.toString(), { round: 2, x: 0, y: 0 });
    expect((await pl(ali)).zone?.x).toBe(startX);

    // Boshlandi: Ali zonaga qadamma-qadam yuradi, Vali bir zumda sakramoqchi — cheklanadi
    tick(zn.ZONE_INTRO_S * 1000 + 100);
    game = (await server.loadZoneGame(id))!;
    await server.zoneTick(game, vali._id.toString(), { round: 2, x: 0, y: 0 });
    for (let k = 0; k < 30; k++) {
      tick(200);
      await server.zoneTick(game, ali._id.toString(), { round: 2, x: waves[0].cx, y: waves[0].cy, stars: 2 });
      await server.zoneTick(game, vali._id.toString(), { round: 2, x: 0, y: 0 });
    }
    const a = (await pl(ali)).zone!;
    expect(Math.hypot(a.x - waves[0].cx, a.y - waves[0].cy)).toBeLessThan(waves[0].r);
    const v = (await pl(vali)).zone!;
    // 6 soniyada 15 birlik/s × 1.35 dan uzoq yurolmaydi
    expect(Math.hypot(v.x - 50, v.y - 31)).toBeLessThan(6.2 * 15 * 1.35 + 2 * 31);

    // Zona yopiladi: Vali tashqarida — o'chadi; yopiq paytda yurib bo'lmaydi
    tick(zn.WAVE_MS + zn.RESOLVE_DELAY_MS - 30 * 200 + 50);
    const r = await server.zoneTick(game, vali._id.toString(), { round: 2, x: waves[0].cx, y: waves[0].cy });
    expect(r?.resolved).toBe(1);
    const vali1 = (await pl(vali)).zone!;
    expect(vali1).toMatchObject({ out: true, outWave: 0 });
    expect((await pl(ali)).zone?.out).toBe(false);

    // Vaqt tugaydi: Ali qolgan to'lqinlarda zonaga bormaydi — 2-to'lqinda o'chadi (agar zona uni qamramasa)
    tick(zn.zoneDurationMs(false));
    as(mentor);
    await live.endZoneAction(id);
    const aliEnd = (await pl(ali)).zone!;
    const valiEnd = (await pl(vali)).zone!;
    expect(valiEnd.points).toBe(zn.zonePoints(0, 3, 0, false));
    const aliSurvived = aliEnd.out ? aliEnd.outWave : 3;
    expect(aliEnd.points).toBe(zn.zonePoints(aliSurvived, 3, 2, false));
    expect(aliEnd.place).toBe(1);
    const score = (await pl(ali)).score;
    await live.endZoneAction(id);
    expect((await pl(ali)).score).toBe(score);

    // Final
    await play(mentor, ali, id, 3);
    as(mentor);
    await live.startLiveQuestionAction(id);
    expect((await LiveGame.findById(id).lean())).toMatchObject({ status: "zone", zone: { round: 5, final: true } });
    tick(zn.ZONE_INTRO_S * 1000 + zn.zoneDurationMs(true) + 2000);
    await live.startLiveQuestionAction(id);
    expect((await LiveGame.findById(id).lean())?.status).toBe("finished");
  });

  it("o'quvchi holatida robot ko'rinadi; raundda yo'q o'quvchi yozolmaydi", async () => {
    const { mentor, ali, id } = await seed();
    await play(mentor, ali, id, 3);
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.zone).toMatchObject({ round: 2, joined: true, out: false, total: 2 });
    const outsider = await User.create({ login: "begona", fullName: "Begona", role: "student", passwordHash: "x" });
    expect(await server.zoneTick((await server.loadZoneGame(id))!, outsider._id.toString(), { round: 2, x: 1, y: 1 })).toBeNull();
  });
});
