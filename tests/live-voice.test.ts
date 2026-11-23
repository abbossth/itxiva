import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { actAs, clearDb, guardsMock, sessionFor, startDb, stopDb } from "./helpers";

process.env.NEXT_PUBLIC_ARENA_WS_URL = "wss://rt.example.test";
process.env.ARENA_SECRET = "voice-test-secret";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ sendNotifications: vi.fn(), notify: vi.fn(), notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyGroup: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 99, resetInSeconds: 1 }), resetRateLimit: vi.fn() }));
vi.mock("@/lib/live-game/voice-server", async (orig) => ({ ...(await orig<object>()), pushVoice: vi.fn(() => Promise.resolve()) }));

const { VoiceRoomCore, emptyVoiceState } = await import("@/lib/live-game/voice-room");
const { packFrames, unpackRelay } = await import("@/lib/live-game/voice-protocol");
type Ticket = import("@/lib/live-game/voice-protocol").VoiceTicket;

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { Lesson } = await import("@/lib/db/models/lesson.model");
const { Quiz } = await import("@/lib/db/models/quiz.model");
const { LiveGame } = await import("@/lib/db/models/live-game.model");
const live = await import("@/actions/live-game.actions");
const voice = await import("@/actions/live-voice.actions");
const voiceServer = await import("@/lib/live-game/voice-server");
const { verifyToken } = await import("@/lib/live-game/arena-token");

const OPEN = { q: null, until: 0, v: 0 } as const;
const ticket = (p: string, extra: Partial<Ticket> = {}): Ticket => ({ k: "voice", g: "g", p, n: p, host: false, muted: false, phase: OPEN, answered: false, exp: 9e15, ...extra });
const pkt = (level = 100) => packFrames(level, [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]);

/** Kim kimga nima oldi: "to:full" yoki "to:level" */
function routes(room: InstanceType<typeof VoiceRoomCore<string>>, from: string, now = 1000): string[] {
  return room
    .audio(from, pkt(), now)
    .map(([to, b]) => `${to}:${unpackRelay(b)!.frames.length ? "full" : "level"}`)
    .sort();
}

function room(...ids: string[]) {
  const r = new VoiceRoomCore<string>(emptyVoiceState());
  for (const id of ids) {
    r.join(id, ticket(id, { host: id === "host" }));
    r.message(id, JSON.stringify({ t: "mic", on: true }));
  }
  return r;
}

describe("ovoz xonasi: kim kimni eshitadi", () => {
  it("ochiq paytda hamma bir-birini eshitadi; paketda gapiruvchi raqami va kadrlar saqlanadi", () => {
    const r = room("ali", "vali", "guli");
    expect(routes(r, "ali")).toEqual(["guli:full", "vali:full"]);
    const [, b] = r.audio("ali", pkt(200), 1000)[0];
    const u = unpackRelay(b)!;
    expect(u.slot).toBe(r.members.get("ali")!.s);
    expect(u.level).toBe(200);
    expect(u.frames.map((f) => [...f])).toEqual([[1, 2, 3], [4, 5]]);
  });

  it("mikrofon o'chiq yoki buzilgan paket — hech kimga bormaydi", () => {
    const r = room("ali", "vali");
    r.message("ali", JSON.stringify({ t: "mic", on: false }));
    expect(routes(r, "ali")).toEqual([]);
    r.message("ali", JSON.stringify({ t: "mic", on: true }));
    expect(r.audio("ali", new Uint8Array([10, 3, 0, 9]), 1000)).toEqual([]);
  });

  it("savol paytida: qulfdagi o'quvchini faqat ustoz eshitadi, u hech kimni eshitmaydi; javob berganlar bir-biri bilan", () => {
    const r = room("ali", "vali", "guli", "host");
    r.control({ g: "g", t: "phase", phase: { q: 0, until: 20_000, v: 1 } });
    // Hech kim javob bermagan: o'quvchilar bir-birini eshitmaydi, ustoz hammani eshitadi
    expect(routes(r, "ali")).toEqual(["host:full"]);
    expect(routes(r, "host")).toEqual([]);
    r.control({ g: "g", t: "answered", q: 0, p: ["ali", "vali"] });
    expect(routes(r, "ali")).toEqual(["host:full", "vali:full"]); // guli javob bermagan — eshitmaydi
    expect(routes(r, "guli")).toEqual(["host:full"]); // guli gapirsa — faqat ustoz
    // Ustozning ovozi qulfdagilarga bormaydi
    expect(routes(r, "host")).toEqual(["ali:full", "vali:full"]);
    // Boshqa savolga javob — hisobga olinmaydi
    expect(r.control({ g: "g", t: "answered", q: 5, p: ["guli"] })).toBeNull();
    // Muddat o'tdi (natija xabari kelmasa ham) — hamma ochiq
    expect(routes(r, "guli", 25_000)).toEqual(["ali:full", "host:full", "vali:full"]);
  });

  it("karnayi o'chiq ustoz — savol paytida ham kim gapirayotganini ko'radi", () => {
    const r = room("ali", "host");
    r.message("host", JSON.stringify({ t: "deaf", on: true }));
    r.control({ g: "g", t: "phase", phase: { q: 0, until: 20_000, v: 1 } });
    expect(routes(r, "ali")).toEqual(["host:level"]);
  });

  it("natija ochilsa hamma gaplashadi; eski bosqich xabari (kech kelgan) e'tiborsiz", () => {
    const r = room("ali", "vali");
    r.control({ g: "g", t: "phase", phase: { q: 0, until: 20_000, v: 5 } });
    expect(r.control({ g: "g", t: "phase", phase: { q: null, until: 0, v: 4 } })).toBeNull();
    expect(routes(r, "ali")).toEqual([]); // savol davom etyapti — o'quvchilar bir-birini eshitmaydi
    r.control({ g: "g", t: "phase", phase: { q: null, until: 0, v: 6 } });
    expect(routes(r, "ali")).toEqual(["vali:full"]);
  });

  it("o'yindan chiqqanlar savol boshidan gaplasha oladi (free)", () => {
    const r = room("ali", "vali", "guli");
    r.control({ g: "g", t: "phase", phase: { q: 1, until: 20_000, v: 1 }, free: ["ali", "vali"] });
    expect(routes(r, "ali")).toEqual(["vali:full"]);
  });

  it("ustoz hammani o'chirsa: o'quvchilar gapira olmaydi, lekin eshitadi; ustoz gapiradi", () => {
    const r = room("ali", "vali", "host");
    r.control({ g: "g", t: "muted", muted: true });
    expect(r.audio("ali", pkt(), 1000)).toEqual([]);
    expect(routes(r, "host")).toEqual(["ali:full", "vali:full"]);
    expect(JSON.parse(r.roster(1000))).toMatchObject({ muted: true, peers: expect.arrayContaining([expect.objectContaining({ n: "ali", mic: false })]) });
  });

  it("karnayi o'chiq — ovoz emas, faqat kim gapirayotgani", () => {
    const r = room("ali", "vali");
    r.message("vali", JSON.stringify({ t: "deaf", on: true }));
    expect(routes(r, "ali")).toEqual(["vali:level"]);
  });

  it("soniyasiga me'yordan ko'p paket — tashlanadi", () => {
    const r = room("ali", "vali");
    let sent = 0;
    for (let i = 0; i < 60; i++) sent += r.audio("ali", pkt(), 1000 + i).length;
    expect(sent).toBe(40);
    expect(r.audio("ali", pkt(), 2100).length).toBe(1);
  });

  it("bilet: xona yangi bo'lsa bosqich va javob holati biletdan olinadi; shu o'quvchi ikkinchi oynada — eskisi yopiladi", () => {
    const r = new VoiceRoomCore<string>(emptyVoiceState());
    r.join("a1", ticket("ali", { phase: { q: 2, until: 20_000, v: 3 }, answered: true, muted: true }));
    expect(r.state.muted).toBe(true);
    expect(r.state.phase.q).toBe(2);
    const j = r.join("a2", ticket("ali"));
    expect(j!.replaced).toEqual(["a1"]);
    expect([...r.members.keys()]).toEqual(["a2"]);
    expect(JSON.parse(r.roster(1000)).peers[0]).toMatchObject({ n: "ali", lock: false });
  });
});

// ---- Sayt tomoni ----

const NOW = new Date("2026-11-10T16:40:00+05:00");

async function seed() {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9 });
  const mk = (login: string) => User.create({ login, fullName: login.toUpperCase(), role: "student", passwordHash: "x", groupId: group._id });
  const [ali, vali, begona] = await Promise.all([mk("ali"), mk("vali"), User.create({ login: "b", fullName: "B", role: "student", passwordHash: "x", groupId: (await Group.create({ name: "8-A", grade: 8 }))._id })]);
  const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "D", isPublished: true, date: NOW });
  await Quiz.create({
    lessonId: lesson._id,
    title: "T",
    isPublished: true,
    questions: [1, 2, 3].map((i) => ({ type: "single_choice" as const, prompt: `${i}?`, options: ["ha", "yo'q"], correctAnswers: ["ha"], points: 1, timeLimit: 10 })),
  });
  actAs(sessionFor(mentor));
  const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 5 });
  if (!res.success) throw new Error(res.error);
  return { mentor, ali, vali, begona, id: res.data.gameId };
}

const as = (u: Parameters<typeof sessionFor>[0]) => actAs(sessionFor(u));
const decode = async (url: string) => verifyToken<Ticket>("voice-test-secret", decodeURIComponent(new URL(url).searchParams.get("t")!));

describe("ovozli suhbat: bilet va o'yin bosqichlari", () => {
  beforeAll(startDb);
  afterAll(stopDb);
  beforeEach(async () => {
    await clearDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.mocked(voiceServer.pushVoice).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("faqat o'yinga qo'shilgan o'quvchi bilet oladi; savol paytida javob bergani biletda", async () => {
    const { mentor, ali, begona, id } = await seed();
    as(begona);
    expect((await voice.getVoiceTicketAction(id)).success).toBe(false);
    as(ali);
    expect(await voice.getVoiceTicketAction(id)).toMatchObject({ success: false, error: "Avval o'yinga qo'shiling" });
    await live.joinLiveGameAction(id);
    const r1 = await voice.getVoiceTicketAction(id);
    if (!r1.success || !r1.data.url) throw new Error("bilet yo'q");
    expect(r1.data.url).toMatch(/^wss:\/\/rt\.example\.test\/voice\/[a-f0-9]{24}\?t=/);
    expect(await decode(r1.data.url)).toMatchObject({ k: "voice", g: id, p: ali._id.toString(), host: false, answered: false, phase: { q: null } });
    expect((await LiveGame.findById(id).lean())!.voice?.used).toBe(true);

    as(mentor);
    await live.startLiveQuestionAction(id);
    as(ali);
    await live.answerLiveQuestionAction(id, 0, "ha");
    const r2 = await voice.getVoiceTicketAction(id);
    if (!r2.success || !r2.data.url) throw new Error("bilet yo'q");
    expect(await decode(r2.data.url)).toMatchObject({ answered: true, phase: { q: 0 } });

    as(mentor);
    const h = await voice.getVoiceTicketAction(id);
    if (!h.success || !h.data.url) throw new Error("bilet yo'q");
    expect(await decode(h.data.url)).toMatchObject({ host: true, p: `host:${mentor._id}` });
  });

  it("savol boshlanishi, javob va natija xonaga yuboriladi (ovozli suhbat ishlatilgan bo'lsa)", async () => {
    const { mentor, ali, id } = await seed();
    as(ali);
    await live.joinLiveGameAction(id);
    as(mentor);
    await live.startLiveQuestionAction(id);
    expect(voiceServer.pushVoice).not.toHaveBeenCalled(); // hali hech kim ulanmagan

    await LiveGame.updateOne({ _id: id }, { $set: { status: "reveal", "voice.used": true } });
    await live.startLiveQuestionAction(id);
    const push = vi.mocked(voiceServer.pushVoice);
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ g: id, t: "phase", phase: expect.objectContaining({ q: 1, until: NOW.getTime() + 10_000 + 2000 }) }));
    as(ali);
    await live.answerLiveQuestionAction(id, 1, "ha");
    expect(push).toHaveBeenLastCalledWith({ g: id, t: "answered", q: 1, p: [ali._id.toString()] });
    as(mentor);
    await live.revealLiveQuestionAction(id);
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ g: id, t: "phase", phase: expect.objectContaining({ q: null }) }));
  });

  it("g'oliblar e'lon qilingach ham 15 daqiqa suhbatga kirish mumkin, keyin yo'q", async () => {
    const { ali, id } = await seed();
    as(ali);
    await live.joinLiveGameAction(id);
    await LiveGame.updateOne({ _id: id }, { $set: { status: "finished", finishedAt: NOW } });
    vi.setSystemTime(new Date(NOW.getTime() + 10 * 60_000));
    const r1 = await voice.getVoiceTicketAction(id);
    expect(r1.success && r1.data.url).toBeTruthy();
    vi.setSystemTime(new Date(NOW.getTime() + 16 * 60_000));
    expect(await voice.getVoiceTicketAction(id)).toMatchObject({ success: true, data: { url: null } });
  });

  it("ustoz hammaning mikrofonini o'chiradi; o'quvchi buni qila olmaydi", async () => {
    const { mentor, ali, id } = await seed();
    as(ali);
    expect((await voice.setVoiceMutedAction(id, true)).success).toBe(false);
    as(mentor);
    expect(await voice.setVoiceMutedAction(id, true)).toEqual({ success: true, data: { muted: true } });
    expect((await LiveGame.findById(id).lean())!.voice?.muted).toBe(true);
    expect(voiceServer.pushVoice).toHaveBeenLastCalledWith({ g: id, t: "muted", muted: true });
  });
});
