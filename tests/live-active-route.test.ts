import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const live = await import("@/actions/live-game.actions");
const route = await import("@/app/api/live/active/route");
const stateRoute = await import("@/app/api/live/state/route");
const hostRoute = await import("@/app/api/live/host/route");
const { NextRequest } = await import("next/server");

type U = Parameters<typeof sessionFor>[0];
const as = (u: U) => actAs(sessionFor(u));
const read = async () => {
  const res = await route.GET();
  expect(res.headers.get("cache-control")).toBe("no-store");
  return ((await res.json()) as { game: { id: string; mode: string; joined: boolean } | null }).game;
};

async function seed() {
  const mentor = await User.create({ login: "ustoz", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
  const group = await Group.create({ name: "9-A", grade: 9 });
  const other = await Group.create({ name: "9-B", grade: 9 });
  const ali = await User.create({ login: "ali", fullName: "Ali", role: "student", passwordHash: "x", groupId: group._id });
  const begona = await User.create({ login: "begona", fullName: "Begona", role: "student", passwordHash: "x", groupId: other._id });
  const lesson = await Lesson.create({ groupId: group._id, quarter: 2, order: 1, title: "Dars", isPublished: true, date: new Date() });
  await Quiz.create({
    lessonId: lesson._id,
    title: "Test",
    isPublished: true,
    questions: [0, 1, 2].map((i) => ({ type: "single_choice" as const, prompt: `${i}?`, options: [`ok${i}`, "x"], correctAnswers: [`ok${i}`], points: 1, timeLimit: 10 })),
  });
  return { mentor, group, ali, begona };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("/api/live/active (header tugmasi va o'yin oynasi)", () => {
  it("o'quvchi guruhida ochiq o'yin bo'lsa — uni qaytaradi, qo'shilgandan keyin joined: true", async () => {
    const { mentor, group, ali } = await seed();
    as(mentor);
    const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 3, minigames: false, arena: false });
    if (!res.success) throw new Error(res.error);

    as(ali);
    expect(await read()).toMatchObject({ id: res.data.gameId, mode: "classic", joined: false });
    await live.joinLiveGameAction(res.data.gameId);
    expect(await read()).toMatchObject({ id: res.data.gameId, joined: true });
  });

  it("boshqa guruh o'quvchisi, ustoz va tizimga kirmagan foydalanuvchi — null", async () => {
    const { mentor, group, begona } = await seed();
    as(mentor);
    const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 3, minigames: false, arena: false });
    if (!res.success) throw new Error(res.error);

    as(begona);
    expect(await read()).toBeNull();
    as(mentor);
    expect(await read()).toBeNull();
    actAs(null);
    expect(await read()).toBeNull();
  });

  it("holat API'lari: o'quvchi/ustoz o'z holatini oladi, sessiyasiz yoki boshqa rol — 401 (redirect emas)", async () => {
    const { mentor, group, ali } = await seed();
    as(mentor);
    const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 3, minigames: false, arena: false });
    if (!res.success) throw new Error(res.error);
    const id = res.data.gameId;
    const get = (r: { GET: (req: InstanceType<typeof NextRequest>) => Promise<Response> }, path: string) => r.GET(new NextRequest(`http://t${path}?gameId=${id}`));

    as(ali);
    await live.joinLiveGameAction(id);
    const s = await get(stateRoute, "/api/live/state");
    expect(s.status).toBe(200);
    const sj = (await s.json()) as { success: boolean; data: { id: string; joined: boolean; status: string } };
    expect(sj).toMatchObject({ success: true, data: { id, joined: true, status: "lobby" } });
    expect((await get(hostRoute, "/api/live/host")).status).toBe(401);

    as(mentor);
    const h = await get(hostRoute, "/api/live/host");
    expect(h.status).toBe(200);
    expect(((await h.json()) as { data: { players: unknown[] } }).data.players).toHaveLength(1);
    expect((await get(stateRoute, "/api/live/state")).status).toBe(401);

    actAs(null);
    expect((await get(stateRoute, "/api/live/state")).status).toBe(401);
    expect((await get(hostRoute, "/api/live/host")).status).toBe(401);
  });
});
