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
const { LiveGamePlayer } = await import("@/lib/db/models/live-game-player.model");
const live = await import("@/actions/live-game.actions");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);
afterEach(() => vi.restoreAllMocks());

describe("kutish zalidagi harakatlar", () => {
  it("bepul harakat ijro etiladi va proyektorga chiqadi; pullik — faqat sotib olingan bo'lsa; tez bosish e'tiborsiz", async () => {
    const mentor = await User.create({ login: "u", fullName: "Ustoz", role: "mentor", passwordHash: "x" });
    const group = await Group.create({ name: "8-A", grade: 8 });
    const ali = await User.create({ login: "ali", fullName: "Ali", role: "student", passwordHash: "x", groupId: group._id });
    const lesson = await Lesson.create({ groupId: group._id, quarter: 1, order: 1, title: "D", isPublished: true, date: new Date() });
    await Quiz.create({ lessonId: lesson._id, title: "T", isPublished: true, questions: [{ type: "single_choice", prompt: "1?", options: ["1", "2"], correctAnswers: ["1"], points: 1, timeLimit: 10 }] });
    actAs(sessionFor(mentor));
    const res = await live.createLiveGameAction({ groupId: group._id.toString(), mode: "classic", source: "all", count: 5 });
    if (!res.success) throw new Error(res.error);
    const id = res.data.gameId;
    actAs(sessionFor(ali));
    await live.joinLiveGameAction(id);

    expect(await live.playEmoteAction(id, "wave")).toMatchObject({ success: true, data: { played: true } });
    expect((await LiveGamePlayer.findOne({ studentId: ali._id }).lean())?.emote?.id).toBe("wave");
    // 1,2 s ichida qayta bosish — e'tiborsiz
    expect(await live.playEmoteAction(id, "kiss")).toMatchObject({ success: true, data: { played: false } });
    // Pullik — sotib olinmagan
    expect((await live.playEmoteAction(id, "dance")).success).toBe(false);
    // Proyektor ro'yxatida ko'rinadi
    actAs(sessionFor(mentor));
    const host = await live.getLiveHostStateAction(id);
    expect(host.success && host.data.players[0].emote?.id).toBe("wave");
  });
});
