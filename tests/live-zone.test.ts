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
const { ZoneRoom, decodeZoneMessage, decodeZoneObject } = await import("@/lib/live-game/zone-room");
const { hmacSign } = await import("@/lib/live-game/arena-token");
const maxStepFor = (speed: number, ms: number) => zn.maxStep(speed, ms);

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
  it("guruhlarga bo'lish: jami = tiriklar, 2–3 zona, har birida kamida 1 joy", () => {
    const rnd = (() => {
      let i = 0;
      return () => [0.1, 0.7, 0.3, 0.9, 0.5][i++ % 5];
    })();
    for (let n = 1; n <= 40; n++) {
      for (let k = 0; k < 5; k++) {
        const caps = zn.zoneSplit(n, rnd);
        expect(caps.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.min(...caps)).toBeGreaterThanOrEqual(1);
        if (n >= 2) expect([2, 3]).toContain(caps.length);
        if (n < 6 && n >= 2) expect(caps).toHaveLength(2);
      }
    }
    // 12 kishi: masalan 6+6, 4+4+4, 5+5+2, 6+3+3 kabi
    const lcg = (seed: number) => {
      let a = seed;
      return () => (a = (a * 16807) % 2147483647) / 2147483647;
    };
    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) seen.add(zn.zoneSplit(12, lcg(seed)).join("+"));
    expect(seen.size).toBeGreaterThan(3);
    expect([...seen].every((c) => c.split("+").reduce((x, y) => x + Number(y), 0) === 12)).toBe(true);
  });

  it("to'lqinlar urug'dan: avval bitta umumiy zona, keyin joyli zonalar, tuzoqlar zonalar ustida emas", () => {
    expect(zn.zoneWave(7, false, 1, 12)).toEqual(zn.zoneWave(7, false, 1, 12));
    const w0 = zn.zoneWave(7, false, 0, 12);
    expect(w0.shared).toBe(true);
    expect(w0.zones).toHaveLength(1);
    expect(w0.zones[0].cap).toBe(0);
    for (let seed = 1; seed < 40; seed++) {
      for (let w = 1; w < 5; w++) {
        const wave = zn.zoneWave(seed, true, w, 12);
        expect(wave.shared).toBe(false);
        expect(wave.zones.reduce((a, z) => a + z.cap, 0)).toBe(12);
        for (const z of wave.zones) {
          expect(z.cx - z.r).toBeGreaterThanOrEqual(0);
          expect(z.cx + z.r).toBeLessThanOrEqual(zn.FIELD.w);
          expect(z.cy + z.r).toBeLessThanOrEqual(zn.FIELD.h);
          for (const t of wave.traps) expect(Math.hypot(t.x - z.cx, t.y - z.cy)).toBeGreaterThan(z.r + t.r);
        }
        expect(wave.stars).toHaveLength(zn.STARS_PER_WAVE);
        expect(wave.traps.length).toBeGreaterThan(0);
      }
    }
    expect(zn.zoneWaveCount(false)).toBe(3);
    expect(zn.zoneWaveCount(true)).toBe(5);
    const start = 1000;
    expect(zn.zonePhase(start, 500, 3)).toMatchObject({ wave: -1 });
    expect(zn.zonePhase(start, start + 100, 3)).toMatchObject({ wave: 0, lock: false });
    expect(zn.zonePhase(start, start + zn.WAVE_MS + 10, 3)).toMatchObject({ wave: 0, lock: true });
    expect(zn.zonePhase(start, start + 3 * (zn.WAVE_MS + zn.LOCK_MS) + 1, 3)).toMatchObject({ done: true });
    expect(zn.zonePoints(3, 3, 2, false)).toBe(3 * 150 + 300 + 60);
    expect(zn.zonePoints(1, 3, 0, true)).toBe(300);
    expect(zn.zoneSpeed(0)).toBe(15);
    expect(zn.zoneSpeed(9)).toBe(23);
    // Elektr tuzoq davriy yonib-o'chadi
    const zap = { id: 1, kind: "zap" as const, x: 0, y: 0, r: 3, phase: 0 };
    expect(zn.zapActive(zap, 10)).toBe(true);
    expect(zn.zapActive(zap, zn.ZAP_ON_MS + 10)).toBe(false);
    expect(zn.zapActive(zap, zn.ZAP_PERIOD_MS + 10)).toBe(true);
  });

  it("joyni birinchi kirgan oladi: zona to'lsa, kech kelgan o'chadi; tashqaridagi ham o'chadi", () => {
    const layout: import("@/lib/live-game/zone").ZoneWave = { shared: false, stars: [], traps: [], zones: [{ cx: 20, cy: 20, r: 6, cap: 2 }, { cx: 70, cy: 30, r: 6, cap: 1 }] };
    const at = (id: string, x: number, y: number, t: number) => ({ id, x, y, out: false, seat: zn.claimSeat(null, 1, zn.zoneIndexAt(x, y, layout), t) });
    const players = [at("a", 20, 20, 300), at("b", 21, 20, 100), at("c", 19, 21, 200), at("d", 70, 30, 50), at("e", 50, 50, 10)];
    const seats = zn.zoneSeats(1, layout, players);
    expect(seats.get("b")).toEqual({ zone: 0, ok: true });
    expect(seats.get("c")).toEqual({ zone: 0, ok: true });
    expect(seats.get("a")).toEqual({ zone: 0, ok: false });
    expect(seats.get("d")).toEqual({ zone: 1, ok: true });
    expect(seats.has("e")).toBe(false);
    expect(zn.zoneEliminated(1, layout, players).sort()).toEqual(["a", "e"]);
    // Zonadan chiqib qayta kirsa — navbat yangidan
    const out = zn.claimSeat({ wave: 1, zone: 0, at: 100 }, 1, -1, 400);
    expect(zn.claimSeat(out, 1, 0, 500)).toEqual({ wave: 1, zone: 0, at: 500 });
  });
});

describe("real vaqt xonasi", () => {
  const ticket = (p: string, x: number, y: number, extra: Partial<import("@/lib/live-game/zone-room").ZoneTicket> = {}) => ({ p, n: p.toUpperCase(), c: 0, sp: 15, x, y, o: 0, s: 0, res: 0, ...extra });

  it("tezlik cheklanadi, joy navbat bilan, natija vaqtida; kech ulangan — o'chgan", () => {
    const st = 10_000;
    const room = new ZoneRoom("g".repeat(24), 2, 99, false, st, st + zn.zoneDurationMs(false));
    room.join(ticket("a", 50, 31));
    room.join(ticket("b", 50, 31));
    room.join(ticket("c", 50, 31));
    const z0 = room.layout(0).zones[0];
    // Sanoqda yurib bo'lmaydi
    room.input("a", { x: z0.cx, y: z0.cy }, st - 500);
    expect(room.players.get("a")).toMatchObject({ x: 50, y: 31 });
    // Sakrab bo'lmaydi: 100 ms da ko'pi bilan ~4 birlik
    room.input("a", { x: z0.cx, y: z0.cy }, st + 100);
    const a1 = room.players.get("a")!;
    expect(Math.hypot(a1.x - 50, a1.y - 31)).toBeLessThan(maxStepFor(15, 600) + 0.01);
    // a va b zonaga yuradi, c turadi
    for (let t = st + 150; t < st + zn.WAVE_MS - 100; t += 100) {
      room.input("a", { x: z0.cx, y: z0.cy }, t);
      room.input("b", { x: z0.cx + 1, y: z0.cy }, t);
      room.input("c", { x: 50, y: 31 }, t);
    }
    room.step(st + zn.WAVE_MS);
    expect(room.resolved).toBe(0);
    room.step(st + zn.WAVE_MS + zn.ROOM_RESOLVE_MS + 1);
    expect(room.resolved).toBe(1);
    expect(room.players.get("c")).toMatchObject({ out: true, outWave: 0 });
    expect(room.players.get("a")?.out).toBe(false);
    // Zona yopiq paytda yurib bo'lmaydi
    const before = { ...room.players.get("a")! };
    room.input("a", { x: 0, y: 0 }, st + zn.WAVE_MS + 800);
    expect(room.players.get("a")).toMatchObject({ x: before.x, y: before.y });
    // 2-to'lqin: 2 tirik — 1+1 joy
    const w1 = room.layout(1);
    expect(w1.zones.map((q) => q.cap)).toEqual([1, 1]);
    // Kech ulangan (bilet 0-to'lqindan oldin) — o'chgan
    room.join(ticket("d", 50, 31));
    expect(room.players.get("d")).toMatchObject({ out: true, outWave: 0 });
    // Ikkalasi bitta zonaga: birinchi kirgan joy oladi
    const target = w1.zones[0];
    const span = zn.WAVE_MS + zn.LOCK_MS;
    for (let t = st + span + 50; t < st + span + zn.WAVE_MS - 50; t += 50) {
      room.input("a", { x: target.cx, y: target.cy }, t);
      if (t > st + span + 2500) room.input("b", { x: target.cx, y: target.cy }, t);
      else room.input("b", { x: room.players.get("b")!.x, y: room.players.get("b")!.y }, t);
    }
    const frame = JSON.parse(room.frame(st + span + zn.WAVE_MS - 60)) as { p: number[][] };
    const codes = new Map(frame.p.map((r) => [r[0], r[4]]));
    const ai = room.players.get("a")!.i;
    const bi = room.players.get("b")!.i;
    expect(codes.get(ai)).toBe(1);
    room.step(st + span + zn.WAVE_MS + zn.ROOM_RESOLVE_MS + 1);
    expect(room.players.get("a")?.out).toBe(false);
    expect(room.players.get("b")).toMatchObject({ out: true, outWave: 1 });
    if (codes.get(bi) !== 0) expect(codes.get(bi)).toBe(-1);
    // Kadr va ro'yxat brauzerda o'qiladi
    const roster = new Map();
    decodeZoneMessage(room.rosterMessage(), roster);
    const f = decodeZoneMessage(room.frame(st + span + zn.WAVE_MS + 500), roster);
    expect(f?.resolved).toBe(2);
    expect(f?.peers.get("b")?.[2]).toBe(2);
    expect(room.results().players).toHaveLength(4);
    // HTTP zaxira javobi: ro'yxat va kadr bitta obyektda
    const relay = JSON.parse(room.relayMessage(st + span + zn.WAVE_MS + 600));
    const r2 = new Map();
    decodeZoneObject(relay.roster, r2);
    expect(decodeZoneObject(relay.frame, r2)?.peers.size).toBe(4);
  });

  it("to'lqin boshidan biroz oldin kelgan harakat qabul qilinadi (telefon soati sal oldinda)", () => {
    const st = 50_000;
    const room = new ZoneRoom("h".repeat(24), 2, 5, false, st, st + zn.zoneDurationMs(false));
    room.join(ticket("a", 50, 31));
    room.input("a", { x: 52, y: 31 }, st - 600);
    expect(room.players.get("a")?.x).toBe(50);
    room.input("a", { x: 52, y: 31 }, st - 100);
    expect(room.players.get("a")?.x).toBe(52);
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
    const waves = [zn.zoneWave(g.zone!.seed, false, 0, 2).zones[0]];
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
    expect(r?.seat).toBe(0);
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

  it("real vaqt xonasi: bilet beriladi, imzoli natija yoziladi, ulanmagan o'quvchi o'chadi", async () => {
    process.env.NEXT_PUBLIC_ARENA_WS_URL = "wss://rt.example";
    process.env.ARENA_SECRET = "s3cret";
    try {
      const { mentor, ali, vali, id } = await seed();
      await play(mentor, ali, id, 3);
      as(mentor);
      await live.startLiveQuestionAction(id);
      const g = (await LiveGame.findById(id).lean())!;
      expect(g.zone?.rt).toBe(true);
      as(ali);
      const st = await live.getLivePlayerStateAction(id);
      expect(st.success && st.data.zone?.ws).toMatch(/^wss:\/\/rt\.example\/zone\//);
      const aliP = (await LiveGamePlayer.findOne({ studentId: ali._id }).lean())!;
      // HTTP yo'li bu rejimda yurgizmaydi va natijani o'zi hisoblamaydi
      tick(zn.ZONE_INTRO_S * 1000 + zn.WAVE_MS + 2000);
      const r = await server.zoneTick((await server.loadZoneGame(id))!, ali._id.toString(), { round: 2, x: 1, y: 1 });
      expect(r?.resolved).toBe(0);
      // Imzosiz — rad etiladi
      const body = JSON.stringify({ g: id, r: 2, resolved: 1, players: [{ id: aliP._id.toString(), x: 10, y: 10, out: false, outWave: -1, stars: 3, seatWave: 0, seatZone: 0, seatAt: 5 }] });
      expect((await server.applyZoneResults(body, "bad")).status).toBe(401);
      expect((await server.applyZoneResults(body, await hmacSign("s3cret", body))).status).toBe(200);
      const a = (await LiveGamePlayer.findOne({ studentId: ali._id }).lean())!.zone!;
      const v = (await LiveGamePlayer.findOne({ studentId: vali._id }).lean())!.zone!;
      expect(a).toMatchObject({ x: 10, y: 10, out: false, stars: 3 });
      expect(v).toMatchObject({ out: true, outWave: 0 });
      expect((await LiveGame.findById(id).lean())?.zone?.resolved).toBe(1);
    } finally {
      delete process.env.NEXT_PUBLIC_ARENA_WS_URL;
      delete process.env.ARENA_SECRET;
    }
  });

  it("boshqa rejimda qisqa o'yin o'rniga Yashil zona chiqishi mumkin", async () => {
    const mentor = await User.create({ login: "ustoz2", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const group = await Group.create({ name: "9.1", grade: 9 });
    const ali = await User.create({ login: "ali2", fullName: "ALI", role: "student", passwordHash: "x", groupId: group._id });
    const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "Dars", isPublished: true, date: NOW });
    await Quiz.create({
      lessonId: lesson._id,
      title: "Test",
      isPublished: true,
      questions: Array.from({ length: 9 }, (_, i) => ({ type: "single_choice" as const, prompt: `${i}?`, options: [String(i), "x"], correctAnswers: [String(i)], points: 1, timeLimit: 10 })),
    });
    as(mentor);
    const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 9, zoneMini: true });
    if (!res.success) throw new Error(res.error);
    const id = res.data.gameId;
    as(ali);
    await live.joinLiveGameAction(id);
    // Birinchi raund: 0.01 → "Mo'ljalga otish"
    await play(mentor, ali, id, 3);
    as(mentor);
    const first = vi.spyOn(Math, "random").mockReturnValueOnce(0.01);
    await live.startLiveQuestionAction(id);
    first.mockRestore();
    expect((await LiveGame.findById(id).lean())?.minigame?.kind).toBe("target");
    tick(60_000);
    await play(mentor, ali, id, 3);
    // Sumkada qolganlar: memory, math, colors, reaction, wheel, bonus, zone — 0.95 → Yashil zona
    const rnd = vi.spyOn(Math, "random").mockReturnValueOnce(0.95);
    as(mentor);
    await live.startLiveQuestionAction(id);
    rnd.mockRestore();
    const g = (await LiveGame.findById(id).lean())!;
    expect(g).toMatchObject({ status: "zone", zone: { round: 5, mini: true, final: false } });
    expect(g.minigameRounds).toContain(5);
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.zone).toMatchObject({ mini: true, joined: true });
    // Tugagach — keyingi savol
    tick(zn.ZONE_INTRO_S * 1000 + zn.zoneDurationMs(false) + 2000);
    as(mentor);
    await live.startLiveQuestionAction(id);
    expect((await LiveGame.findById(id).lean())).toMatchObject({ status: "question", index: 6 });
  });
});
