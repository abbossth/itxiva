import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDb, guardsMock, startDb, stopDb } from "./helpers";

vi.mock("@/lib/auth/guards", () => guardsMock);
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ notifyMany: vi.fn(), notifyMentors: vi.fn(), notifyUser: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendPush: vi.fn(async () => 1), pushPublicKey: () => null }));

const { User } = await import("@/lib/db/models/user.model");
const { Group } = await import("@/lib/db/models/group.model");
const { ChatMessage, ChatNewsPost } = await import("@/lib/db/models/chat.model");
const core = await import("@/lib/chat/core");
const feed = await import("@/lib/chat/news-feed");
const { NEWS } = await import("@/lib/whats-new");

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  feed.resetNewsSync();
});

async function viewer() {
  const g = await Group.create({ name: "XSH-25I0802", grade: 8 });
  const u = await User.create({ login: "ali", fullName: "Ali Valiyev", role: "student", passwordHash: "x", groupId: g._id });
  return { userId: String(u._id), role: "student" as const, groupId: String(g._id), fullName: u.fullName };
}

describe("yangiliklar chatga post qilinadi", () => {
  it("faqat o'quvchilar uchun, sanasi yetganlari, eng eskisidan; har biri bir marta", async () => {
    const due = feed.newsForChat();
    expect(due.length).toBeGreaterThan(0);
    expect(due.every((n) => n.audience === "student" && n.date >= feed.NEWS_CHAT_SINCE)).toBe(true);
    expect(NEWS.some((n) => n.date < feed.NEWS_CHAT_SINCE && due.includes(n))).toBe(false);

    const v = await viewer();
    const rooms = await core.listRooms(v);
    const general = rooms.find((r) => r.kind === "general")!;
    expect(general.lastText).toContain("📢");
    const msgs = await core.loadMessages(general.id, {});
    const posts = msgs.filter((m) => m.news);
    expect(posts.map((m) => m.news!.id)).toEqual(due.map((n) => n.id));
    expect(posts[0]).toMatchObject({ senderName: "IT Xiva", news: { title: due[0].title, slides: due[0].slides } });

    // Yangi jarayon (deploy) — qayta post qilinmaydi; xabarlar o'chib ketgan bo'lsa ham
    await ChatMessage.deleteMany({});
    feed.resetNewsSync();
    expect(await feed.syncNewsToChat()).toBe(0);
    expect(await ChatMessage.countDocuments({ news: { $ne: null } })).toBe(0);
    expect(await ChatNewsPost.countDocuments({})).toBe(due.length);
  });

  it("kartada yangilik topilmasa — null; previewda sarlavha", () => {
    expect(feed.newsCard("yoq-narsa")).toBeNull();
    const n = feed.newsForChat()[0];
    expect(core.previewOf({ news: n.id })).toBe(`📢 ${n.title}`);
  });
});
