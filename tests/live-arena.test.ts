import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, sessionMock, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("@/lib/auth/session", () => sessionMock);
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
const route = await import("@/app/api/live/pvp/route");
const resultRoute = await import("@/app/api/live/pvp/result/route");
const { hmacSign, verifyTicket } = await import("@/lib/live-game/arena-token");
const { NextRequest } = await import("next/server");
const { PICKUP_EVERY_MS, PVP_INTRO_S, SPAWN_SHIELD_MS, TEAM_WIN_BONUS, pvpBonus, pvpLoadout, pvpStandings, resolve, stepShots, fireShots, teleportFrom, teamArenaStandings } = await import("@/lib/live-game/pvp");

const NOW = new Date("2026-11-10T16:40:00+05:00");
const tick = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
type U = Parameters<typeof sessionFor>[0];
const as = (u: U) => actAs(sessionFor(u));

async function seed(arena = true) {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9 });
  const other = await Group.create({ name: "9-B", grade: 9 });
  const mk = (login: string, groupId = group._id) => User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId });
  const ali = await mk("ali");
  const vali = await mk("vali");
  const begona = await mk("begona", other._id);
  const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Dars", isPublished: true, date: NOW });
  await Quiz.create({
    lessonId: lesson._id,
    title: "Test",
    isPublished: true,
    questions: [0, 1, 2].map((i) => ({ type: "single_choice" as const, prompt: `${i}?`, options: [`ok${i}`, "x"], correctAnswers: [`ok${i}`], points: 1, timeLimit: 10 })),
  });
  as(mentor);
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 5, minigames: false, arena });
  if (!res.success) throw new Error(res.error);
  const id = res.data.gameId;
  for (const s of [ali, vali]) {
    as(s);
    await live.joinLiveGameAction(id);
  }
  // Uch savol: Ali hammasiga to'g'ri, Vali — hech biriga
  for (let i = 0; i < 3; i++) {
    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    const g = (await LiveGame.findById(id).lean())!;
    await live.answerLiveQuestionAction(id, i, g.questions[i].correctAnswers[0]);
    as(mentor);
    await live.revealLiveQuestionAction(id);
  }
  return { mentor, ali, vali, begona, id };
}

const player = async (u: { _id: import("mongoose").Types.ObjectId }) => (await LiveGamePlayer.findOne({ studentId: u._id }).lean())!;

/** Jang oldidan: o'quvchilar xaritaga ovoz beradi, ustoz ovozni yakunlaydi — jang shu xaritada boshlanadi */
async function voteAndGo(id: string, mentor: U, voters: U[], map = "neon") {
  const g = (await LiveGame.findById(id).lean())!;
  for (const v of voters) {
    as(v);
    expect((await live.voteArenaMapAction(id, g.arena!.round!, map)).success).toBe(true);
  }
  as(mentor);
  expect((await live.resolveArenaVoteAction(id)).success).toBe(true);
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("kiber jang qoidalari", () => {
  it("yuklama: 3+ to'g'ri — +1 jon va tezroq qurol", () => {
    expect(pvpLoadout(0)).toMatchObject({ lives: 3, weapon: "Lazer-1" });
    expect(pvpLoadout(3)).toMatchObject({ lives: 4, weapon: "Lazer-2" });
    expect(pvpLoadout(8).cooldown).toBeLessThan(pvpLoadout(3).cooldown);
  });

  it("bonus va o'rinlar", () => {
    expect(pvpBonus(2, true, true)).toBe(2 * 150 + 300 + 500);
    expect(pvpBonus(100, true, true)).toBe(2000);
    const order = pvpStandings([
      { id: "a", lives: 0, out: true, outAt: 10, kills: 5 },
      { id: "b", lives: 1, out: false, kills: 0 },
      { id: "c", lives: 0, out: true, outAt: 20, kills: 0 },
      { id: "d", lives: 3, out: false, kills: 1 },
    ]);
    expect(order.map((r) => r.id)).toEqual(["d", "b", "c", "a"]);
  });

  it("devorlar, o'q tegishi va teleport", () => {
    // Devor ichiga kirib bo'lmaydi
    // Klassik xarita 1,25 marta kattalashgan: markaziy devor (1350,700)–(1450,750)
    const p = resolve(1375, 725);
    expect(p.y < 700 || p.y > 750 || p.x < 1350 || p.x > 1450).toBe(true);
    // O'q egasiga tegmaydi, boshqaga tegadi
    let id = 1;
    const shots = fireShots("me", 300, 100, 0, false, () => id++);
    const r = stepShots(shots, 0.3, [{ id: "me", x: 300, y: 100 }, { id: "foe", x: 500, y: 100 }]);
    expect(r.hits.map((h) => h.target)).toEqual(["foe"]);
    // Uchtalik — uchta o'q
    expect(fireShots("me", 300, 100, 0, true, () => id++)).toHaveLength(3);
    // Teleport
    expect(teleportFrom(525, 875, 1, 0)?.x).toBeGreaterThan(2400);
  });
});

describe("jamoaviy arena", () => {
  it("qoidalar: o'q jamoadosh ustidan o'tadi, jamoalar tirik a'zolar bo'yicha", () => {
    const shot = { id: 1, owner: "a", x: 100, y: 100, vx: 1100, vy: 0, dist: 0 };
    const r = stepShots([{ ...shot }], 0.1, [{ id: "b", x: 160, y: 100 }], (o, t) => o === "a" && t === "b");
    expect(r.hits).toHaveLength(0);
    expect(stepShots([{ ...shot }], 0.1, [{ id: "b", x: 160, y: 100 }]).hits).toHaveLength(1);
    const t = teamArenaStandings([
      { team: 0, lives: 1, out: false, kills: 0 },
      { team: 1, lives: 3, out: false, kills: 2 },
      { team: 1, lives: 0, out: true, kills: 0 },
      { team: 0, lives: 2, out: false, kills: 1 },
    ]);
    expect(t.map((x) => [x.team, x.alive, x.members])).toEqual([
      [0, 2, 2],
      [1, 1, 2],
    ]);
  });

  it("jamoaviy jang: jamoadoshni urib bo'lmaydi, g'olib jamoaning har a'zosi bonus oladi", async () => {
    const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const group = await Group.create({ name: "9-A", grade: 9 });
    const mk = (login: string) => User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId: group._id });
    const studs = [await mk("ali"), await mk("vali"), await mk("olim"), await mk("soli")];
    const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Dars", isPublished: true, date: NOW });
    await Quiz.create({ lessonId: lesson._id, title: "T", isPublished: true, questions: [{ type: "single_choice" as const, prompt: "?", options: ["ok", "x"], correctAnswers: ["ok"], points: 1, timeLimit: 10 }] });
    as(mentor);
    const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "team", source: "all", count: 5, teams: 2, minigames: false, arena: true, teamArena: true });
    if (!res.success) throw new Error(res.error);
    const id = res.data.gameId;
    expect((await LiveGame.findById(id).lean())?.options).toMatchObject({ arena: true, teamArena: true });
    for (const s of studs) {
      as(s);
      await live.joinLiveGameAction(id);
    }
    as(mentor);
    await live.startLiveQuestionAction(id);
    await live.revealLiveQuestionAction(id);
    await live.startLiveQuestionAction(id);
    await voteAndGo(id, mentor, studs);
    const g = (await LiveGame.findById(id).lean())!;
    expect(g.status).toBe("arena");
    const ps = await LiveGamePlayer.find({ gameId: id }).lean();
    for (const p of ps) expect(p.arena?.team).toBe(p.team);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.arena?.teams?.map((t) => t.members)).toEqual([2, 2]);

    // Jamoadosh va raqib: 0-jamoadagi birinchi o'yinchi otadi
    const by = (team: number) => ps.filter((p) => p.team === team);
    const shooter = by(0)[0];
    const mate = by(0)[1];
    const foe = by(1)[0];
    const shooterUser = studs.find((s) => s._id.equals(shooter.studentId))!;
    tick(PVP_INTRO_S * 1000 + SPAWN_SHIELD_MS + 100);
    await LiveGamePlayer.updateMany({ gameId: id }, { $set: { "arena.x": 400, "arena.y": 400 } });
    as(shooterUser);
    const shoot = (target: string, sid: number) => live.pvpTickAction(id, { x: 400, y: 400, a: 0, shots: [{ id: sid, x: 420, y: 400, a: 0 }], hits: [{ target, shot: sid }] });
    await shoot(String(mate._id), 1);
    expect((await LiveGamePlayer.findById(mate._id).lean())?.arena?.lives).toBe(mate.arena!.lives);
    await shoot(String(foe._id), 2);
    expect((await LiveGamePlayer.findById(foe._id).lean())?.arena?.lives).toBe(foe.arena!.lives - 1);

    // 1-jamoa butunlay yiqildi — 0-jamoa g'olib
    await LiveGamePlayer.updateMany({ gameId: id, team: 1 }, { $set: { "arena.out": true, "arena.lives": 0 } });
    as(mentor);
    await live.endArenaAction(id);
    const after = await LiveGamePlayer.find({ gameId: id }).lean();
    for (const p of after) {
      if (p.team === 0) expect(p.arena?.points).toBeGreaterThanOrEqual(TEAM_WIN_BONUS + 300);
      else expect(p.arena?.points).toBeLessThan(TEAM_WIN_BONUS);
      expect(p.arena?.place).toBe(p.team === 0 ? 1 : 2);
    }
    const ev = (await LiveGame.findById(id).lean())!.events.map((e) => e.text);
    expect(ev.some((t) => t.includes("g'alaba"))).toBe(true);
  });

  it("individual tanlansa — jamoadoshni ham urish mumkin", async () => {
    const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const group = await Group.create({ name: "9-A", grade: 9 });
    as(mentor);
    const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Dars", isPublished: true, date: NOW });
    await Quiz.create({ lessonId: lesson._id, title: "T", isPublished: true, questions: [{ type: "single_choice" as const, prompt: "?", options: ["ok", "x"], correctAnswers: ["ok"], points: 1, timeLimit: 10 }] });
    const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "team", source: "all", count: 5, minigames: false, arena: true, teamArena: false });
    if (!res.success) throw new Error(res.error);
    expect((await LiveGame.findById(res.data.gameId).lean())?.options.teamArena).toBe(false);
    // Boshqa rejimda jamoaviy arena yoqilmaydi
    await live.cancelLiveGameAction(res.data.gameId);
    const other = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 5, arena: true, teamArena: true });
    if (!other.success) throw new Error(other.error);
    expect((await LiveGame.findById(other.data.gameId).lean())?.options).toMatchObject({ arena: true, teamArena: false });
  });
});

describe("xarita uchun ovoz berish", () => {
  it("o'quvchilar ovoz beradi (o'zgartirish mumkin), proyektor hisobni ko'radi; ovozdan keyin jang shu xaritada", async () => {
    const { mentor, ali, vali, begona, id } = await seed();
    as(mentor);
    await live.startLiveQuestionAction(id);
    const round = (await LiveGame.findById(id).lean())!.arena!.round!;
    as(ali);
    await live.voteArenaMapAction(id, round, "forest");
    await live.voteArenaMapAction(id, round, "ice");
    as(vali);
    await live.voteArenaMapAction(id, round, "ice");
    expect((await live.voteArenaMapAction(id, round, "hack")).success).toBe(false);
    as(begona);
    expect((await live.voteArenaMapAction(id, round, "ice")).success).toBe(false);
    as(mentor);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.arena?.vote).toMatchObject({ voted: 2, total: 2, counts: { ice: 2, forest: 0 } });
    as(ali);
    const me = await live.getLivePlayerStateAction(id);
    expect(me.success && me.data.arena).toMatchObject({ ready: false, vote: { myVote: "ice" } });

    as(mentor);
    await live.resolveArenaVoteAction(id);
    // Ikkinchi marta — hech narsa
    expect((await live.resolveArenaVoteAction(id)).success && true).toBe(true);
    const g = (await LiveGame.findById(id).lean())!;
    expect(g.arena).toMatchObject({ map: "ice", voteEndsAt: null });
    expect(g.events.some((e) => e.text.includes("Muz labirint"))).toBe(true);
    // Qahramonlar muz labirintda joylashtirildi; sovg'alar ham shu xaritada
    const { ARENA_MAPS } = await import("@/lib/live-game/pvp");
    expect(g.arena!.pickups[0]).toMatchObject({ x: ARENA_MAPS.ice.pickups[0].x, y: ARENA_MAPS.ice.pickups[0].y });
    as(ali);
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.arena).toMatchObject({ ready: true, vote: null, map: "ice", lives: 4 });
    // Ovoz yopildi
    expect((await live.voteArenaMapAction(id, round, "space")).success).toBe(false);
    // HTTP qadami: xarita chegarasi kattaroq, reaksiya boshqalarga ko'rinadi
    tick(PVP_INTRO_S * 1000 + 500);
    const t = await live.pvpTickAction(id, { x: 3150, y: 1750, em: 1 });
    expect(t.success && t.data.world.map).toBe("ice");
    expect((await player(ali)).arena).toMatchObject({ x: 3150, y: 1750, emote: 1 });
    as(vali);
    const v = await live.pvpTickAction(id, { x: 500, y: 500 });
    expect(v.success && v.data.world.peers.find((p) => p.name === "ALI")?.emote).toBe(1);
  });
});

describe("kiber jang (server)", () => {
  it("jon faqat haqiqiy o'qdan ayiriladi, 3 (yoki 4) o'qda chiqadi; sovg'ani birinchi olgan oladi; yakunda bonus bir marta", async () => {
    const { mentor, ali, vali, begona, id } = await seed();
    as(mentor);
    const r = await live.startLiveQuestionAction(id);
    expect(r.success && r.data.finished).toBe(false);
    expect((await LiveGame.findById(id).lean())?.status).toBe("arena");
    await voteAndGo(id, mentor, [ali, vali]);
    expect((await player(ali)).arena).toMatchObject({ lives: 4, weapon: "Lazer-2", out: false });
    expect((await player(vali)).arena).toMatchObject({ lives: 3, weapon: "Lazer-1" });
    const valiId = (await player(vali))._id.toString();
    const aliId = (await player(ali))._id.toString();

    // Boshqa guruh o'quvchisi ulana olmaydi
    as(begona);
    expect((await live.pvpTickAction(id, { x: 100, y: 100 })).success).toBe(false);

    // Sanoq paytida: joylashuv yozilmaydi, o'z holati qaytadi
    as(vali);
    const intro = await live.pvpTickAction(id, { x: 600, y: 150 });
    expect(intro.success && intro.data.world.startsInMs).toBeGreaterThan(0);
    expect((await player(vali)).arena?.x).not.toBe(600);

    // Boshlanishdagi himoya: o'q tegmaydi
    tick(PVP_INTRO_S * 1000 + 500);
    as(vali);
    await live.pvpTickAction(id, { x: 600, y: 150 });
    as(ali);
    let t = await live.pvpTickAction(id, { x: 200, y: 150, shots: [{ id: 1, x: 230, y: 150, a: 0 }], hits: [{ target: valiId, shot: 1 }] });
    expect(t.success && t.data.accepted).toBe(0);
    expect((await player(vali)).arena?.lives).toBe(3);

    tick(SPAWN_SHIELD_MS);
    // Otilmagan o'q bilan "tekkizish" qabul qilinmaydi
    t = await live.pvpTickAction(id, { x: 200, y: 150, hits: [{ target: valiId, shot: 99 }] });
    expect(t.success && t.data.accepted).toBe(0);
    // Haqiqiy o'q — -1 jon; o'sha o'q qayta hisoblanmaydi
    t = await live.pvpTickAction(id, { x: 200, y: 150, shots: [{ id: 2, x: 230, y: 150, a: 0 }], hits: [{ target: valiId, shot: 2 }] });
    expect(t.success && t.data.accepted).toBe(1);
    t = await live.pvpTickAction(id, { x: 200, y: 150, hits: [{ target: valiId, shot: 2 }] });
    expect(t.success && t.data.accepted).toBe(0);
    // Daxlsizlik oralig'ida ikkinchi o'q o'tmaydi
    t = await live.pvpTickAction(id, { x: 200, y: 150, shots: [{ id: 3, x: 230, y: 150, a: 0 }], hits: [{ target: valiId, shot: 3 }] });
    expect(t.success && t.data.accepted).toBe(0);
    expect((await player(vali)).arena?.lives).toBe(2);
    // Juda uzoqdagi nishonga "tekkan" o'q qabul qilinmaydi
    tick(500);
    t = await live.pvpTickAction(id, { x: 2300, y: 1300, shots: [{ id: 4, x: 2300, y: 1300, a: 0 }], hits: [{ target: valiId, shot: 4 }] });
    expect(t.success && t.data.accepted).toBe(0);

    for (const shot of [5, 6]) {
      tick(500);
      await live.pvpTickAction(id, { x: 200, y: 150, shots: [{ id: shot, x: 230, y: 150, a: 0 }], hits: [{ target: valiId, shot }] });
    }
    expect((await player(vali)).arena).toMatchObject({ lives: 0, out: true, killedBy: "ALI" });
    expect((await player(ali)).arena).toMatchObject({ kills: 1, hits: 3 });
    expect((await LiveGame.findById(id).lean())?.arena?.feed.some((f) => f.kind === "kill" && f.a === "ALI" && f.b === "VALI")).toBe(true);

    // Chiqqan o'yinchi harakatlana olmaydi, lekin maydonni ko'radi
    as(vali);
    const spec = await live.pvpTickAction(id, { x: 900, y: 900 });
    expect(spec.success && spec.data.me.out).toBe(true);
    expect(spec.success && spec.data.world.alive).toBe(1);
    expect((await player(vali)).arena?.x).toBe(600);

    // Sovg'a: birinchi yetib kelgan oladi
    as(ali);
    const got = await live.pvpTickAction(id, { x: 1500, y: 875, claim: 1 });
    expect(got.success && got.data.claimed).toBe("triple");
    expect(got.success && got.data.me.powers.triple).toBeGreaterThan(0);
    const again = await live.pvpTickAction(id, { x: 1500, y: 875, claim: 1 });
    expect(again.success && again.data.claimed).toBe(null);
    // Uzoqdan olib bo'lmaydi
    const far = await live.pvpTickAction(id, { x: 200, y: 150, claim: 2 });
    expect(far.success && far.data.claimed).toBe(null);
    // Vaqt o'tib yangi sovg'a chiqadi
    const before = (await LiveGame.findById(id).lean())!.arena!.pickups.length;
    tick(PICKUP_EVERY_MS);
    await live.pvpTickAction(id, { x: 200, y: 150 });
    expect((await LiveGame.findById(id).lean())!.arena!.pickups.length).toBe(before + 1);

    // Proyektor butun maydonni ko'radi
    as(mentor);
    const w = await live.watchArenaAction(id);
    expect(w.success && w.data?.peers.map((p) => [p.name, p.out]).sort()).toEqual([
      ["ALI", false],
      ["VALI", true],
    ]);
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.arena?.alive).toBe(1);

    const score = (await player(ali)).score;
    await live.endArenaAction(id);
    await live.endArenaAction(id);
    expect((await player(ali)).score).toBe(score + pvpBonus(1, true, true));
    expect((await player(ali)).arena).toMatchObject({ place: 1 });
    expect((await player(vali)).arena).toMatchObject({ place: 2, points: 0 });
    expect(aliId).not.toBe(valiId);

    as(ali);
    expect((await live.pvpTickAction(id, { x: 1, y: 1 })).success && true).toBe(true);
    as(mentor);
    const fin = await live.startLiveQuestionAction(id);
    expect(fin.success && fin.data.finished).toBe(true);
    expect((await LiveGame.findById(id).lean())?.status).toBe("finished");
  });

  it("tezkor API: o'quvchi qadami va proyektor ko'rinishi; begona va mentor bo'lmaganlarga yopiq", async () => {
    const { mentor, ali, vali, begona, id } = await seed();
    as(mentor);
    await live.startLiveQuestionAction(id);
    await voteAndGo(id, mentor, [ali, vali]);
    tick(PVP_INTRO_S * 1000 + 500);
    await User.updateMany({}, { mustChangePassword: false });
    const post = (input: object, gameId = id) =>
      route.POST(new NextRequest("http://t/api/live/pvp", { method: "POST", body: JSON.stringify({ gameId, input }) }));
    as(ali);
    const r = await post({ x: 300, y: 300, a: 0 });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.data.me.name).toBe("ALI");
    expect(body.data.world.peers).toHaveLength(2);
    expect((await player(ali)).arena?.x).toBe(300);
    // Proyektor (GET) — faqat mentor
    expect((await route.GET(new NextRequest(`http://t/api/live/pvp?gameId=${id}`))).status).toBe(401);
    as(begona);
    expect((await post({ x: 1, y: 1 })).status).toBe(404);
    as(mentor);
    expect((await post({ x: 1, y: 1 })).status).toBe(401);
    const w = await route.GET(new NextRequest(`http://t/api/live/pvp?gameId=${id}`));
    expect(w.status).toBe(200);
    expect((await w.json()).data.peers).toHaveLength(2);
  });

  it("real vaqt xonasi: bilet beriladi; xona natijasi imzo bilan Mongo'ga yoziladi, keyin bonus to'g'ri", async () => {
    process.env.ARENA_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_ARENA_WS_URL = "wss://arena.example.dev";
    try {
      const { mentor, ali, vali, id } = await seed();
      as(mentor);
      await live.startLiveQuestionAction(id);
      // Ovoz paytida bilet yo'q (jang hali boshlanmagan)
      as(ali);
      const during = await live.getLivePlayerStateAction(id);
      expect(during.success && during.data.arena?.ws).toBe(null);
      expect(during.success && during.data.arena?.vote?.total).toBe(2);
      await voteAndGo(id, mentor, [ali, vali], "ice");
      as(ali);
      const st = await live.getLivePlayerStateAction(id);
      expect(st.success && st.data.arena?.map).toBe("ice");
      const ws = st.success ? st.data.arena?.ws : null;
      expect(ws).toMatch(/^wss:\/\/arena\.example\.dev\/room\/[a-f0-9]{24}\/2\?t=/);
      const ticket = await verifyTicket("test-secret", decodeURIComponent(new URL(ws!).searchParams.get("t")!));
      expect(ticket).toMatchObject({ g: id, r: 2, role: "player", n: "ALI", lives: 4 });
      as(mentor);
      const host = await live.getLiveHostStateAction(id);
      const hostTicket = await verifyTicket("test-secret", decodeURIComponent(new URL((host.success && host.data.arena?.ws) || "x:/").searchParams.get("t") ?? ""));
      expect(hostTicket?.role).toBe("watch");

      const aliId = (await player(ali))._id.toString();
      const valiId = (await player(vali))._id.toString();
      const body = JSON.stringify({
        g: id,
        r: 2,
        players: [
          { id: aliId, lives: 4, maxLives: 4, kills: 1, hits: 3, hitsTaken: 0, out: false, outAt: null, killedBy: null, x: 300, y: 300 },
          { id: valiId, lives: 0, maxLives: 3, kills: 0, hits: 0, hitsTaken: 3, out: true, outAt: Date.now(), killedBy: "ALI", x: 500, y: 300 },
        ],
        feed: [{ at: Date.now(), kind: "kill", a: "ALI", b: "VALI" }],
      });
      const post = (sig: string | null, b = body) =>
        resultRoute.POST(new NextRequest("http://t/api/live/pvp/result", { method: "POST", body: b, headers: sig ? { "x-arena-sig": sig } : {} }));
      expect((await post(null)).status).toBe(401);
      expect((await post(await hmacSign("boshqa", body))).status).toBe(401);
      const wrongRound = body.replace('"r":2', '"r":1');
      expect((await post(await hmacSign("test-secret", wrongRound), wrongRound)).status).toBe(409);
      expect((await post(await hmacSign("test-secret", body))).status).toBe(200);
      expect((await player(vali)).arena).toMatchObject({ out: true, lives: 0, killedBy: "ALI" });
      expect((await LiveGame.findById(id).lean())?.arena?.feed[0]).toMatchObject({ kind: "kill", a: "ALI" });

      const score = (await player(ali)).score;
      await live.endArenaAction(id);
      expect((await player(ali)).score).toBe(score + pvpBonus(1, true, true));
      // Jang tugagach kelgan natija qabul qilinmaydi
      expect((await post(await hmacSign("test-secret", body))).status).toBe(409);
    } finally {
      delete process.env.ARENA_SECRET;
      delete process.env.NEXT_PUBLIC_ARENA_WS_URL;
    }
  });

  it("jang tugatilmasdan 'Keyingi' bosilsa — avval bonus hisoblanadi, keyin yakun", async () => {
    const { mentor, ali, vali, id } = await seed();
    as(mentor);
    await live.startLiveQuestionAction(id);
    await voteAndGo(id, mentor, [ali, vali]);
    const before = (await player(ali)).score;
    await live.startLiveQuestionAction(id);
    // Ikkalasi ham tirik: har biri 300 (tirik qolgani uchun)
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
