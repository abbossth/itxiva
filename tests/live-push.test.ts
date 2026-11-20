import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const live = await import("@/actions/live-game.actions");
const { lobbyNeighbors } = await import("@/lib/live-game/push");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe("kutish zalida itarish", () => {
  it("qo'shnilar: chetda bittasi; jamoaviyda faqat o'z jamoasi qatorida", () => {
    const o = [
      { id: "a", team: 0 },
      { id: "b", team: 1 },
      { id: "c", team: 0 },
    ];
    expect(lobbyNeighbors(o, "a", false)).toMatchObject({ left: null, right: { id: "b" } });
    expect(lobbyNeighbors(o, "b", false)).toMatchObject({ left: { id: "a" }, right: { id: "c" } });
    expect(lobbyNeighbors(o, "a", true)).toMatchObject({ left: null, right: { id: "c" } });
  });

  it("itaruvchiga, itarilganga va proyektorga ko'rinadi; tez-tez bosib bo'lmaydi", async () => {
    const mentor = await User.create({ login: "u", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const group = await Group.create({ name: "8-A", grade: 8 });
    const mk = (n: string) => User.create({ login: n.toLowerCase(), fullName: n, role: "student", passwordHash: "x", groupId: group._id });
    const ali = await mk("Ali");
    const vali = await mk("Vali");
    const sardor = await mk("Sardor");
    const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "D", isPublished: true, date: new Date() });
    await Quiz.create({ lessonId: lesson._id, title: "T", isPublished: true, questions: [{ type: "single_choice", prompt: "?", options: ["a", "b"], correctAnswers: ["a"], points: 1, timeLimit: 10 }] });
    actAs(sessionFor(mentor));
    const g = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 5 });
    if (!g.success) throw new Error(g.error);
    const id = g.data.gameId;
    for (const u of [ali, vali, sardor]) {
      actAs(sessionFor(u));
      await live.joinLiveGameAction(id);
      await new Promise((r) => setTimeout(r, 5)); // qo'shilish tartibi aniq bo'lsin
    }
    actAs(sessionFor(vali));
    const st = await live.getLivePlayerStateAction(id);
    expect(st.success && st.data.lobby).toMatchObject({ left: { name: "Ali" }, right: { name: "Sardor" } });
    const r = await live.playPushAction(id, "right");
    expect(r.success && r.data).toEqual({ pushed: true, name: "Sardor", waitMs: 10_000 });
    expect((await live.playPushAction(id, "left")).success && (await live.playPushAction(id, "left"))).toMatchObject({ data: { pushed: false } });
    expect(((await live.getLivePlayerStateAction(id)) as { data: { lobby: { myPush: unknown } } }).data.lobby.myPush).toMatchObject({ name: "Sardor", dir: "right" });
    actAs(sessionFor(sardor));
    expect(((await live.getLivePlayerStateAction(id)) as { data: { lobby: { pushedBy: unknown } } }).data.lobby.pushedBy).toMatchObject({ name: "Vali", dir: "right" });
    expect((await live.playPushAction(id, "right")).success).toBe(false); // o'ngida hech kim yo'q
    actAs(sessionFor(mentor));
    const host = await live.getLiveHostStateAction(id);
    const rows = host.success ? host.data.players : [];
    expect(rows.find((p) => p.name === "Vali")?.push).toMatchObject({ dir: "right" });
    expect(rows.find((p) => p.name === "Sardor")?.pushedBy).toMatchObject({ dir: "right" });
  });
});
