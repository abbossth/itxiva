// Platform news → chat: every "What's new" announcement for students (lib/whats-new.ts) is also posted to the
// general chat as a picture + text card from "IT Xiva", so everyone sees it there too (not only in the modal).
// Runs once per server process (i.e. after each deploy) on the first chat request; a persistent marker per news
// id (ChatNewsPost) guarantees each announcement is posted exactly once, even though chat messages expire.

import mongoose from "mongoose";
import { NEWS, type NewsItem } from "@/lib/whats-new";
import { connectToDatabase } from "@/lib/db/connect";
import { ChatMessage, ChatNewsPost, ChatRoom } from "@/lib/db/models/chat.model";

/** Announcements from this date on go to the chat (older ones were shown before the feature existed) */
export const NEWS_CHAT_SINCE = "2026-11-28";
/** Sender id of system posts (no such user; the name is shown as "IT Xiva") */
export const SYSTEM_SENDER_ID = "000000000000000000000a11";
export const SYSTEM_SENDER_NAME = "IT Xiva";

export type NewsCard = Pick<NewsItem, "id" | "badge" | "title" | "slides" | "cta">;

const BY_ID = new Map(NEWS.map((n) => [n.id, n]));

export function newsCard(id: string): NewsCard | null {
  const n = BY_ID.get(id);
  return n ? { id: n.id, badge: n.badge, title: n.title, slides: n.slides, cta: n.cta } : null;
}

/** Student announcements due for the chat, oldest first (NEWS lists the newest first) */
export function newsForChat(list: NewsItem[] = NEWS): NewsItem[] {
  return list
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.audience === "student" && n.date >= NEWS_CHAT_SINCE)
    .sort((a, b) => (a.n.date === b.n.date ? b.i - a.i : a.n.date < b.n.date ? -1 : 1))
    .map(({ n }) => n);
}

let running: Promise<number> | null = null;
let done = false;

/** Post the not-yet-posted announcements; returns how many were posted. Safe to call often. */
export function syncNewsToChat(): Promise<number> {
  if (done) return Promise.resolve(0);
  if (!running)
    running = postPending()
      .then((n) => {
        done = true;
        return n;
      })
      .finally(() => {
        running = null;
      });
  return running;
}

/** For tests: forget that this process already synced */
export function resetNewsSync() {
  done = false;
  running = null;
}

async function postPending(): Promise<number> {
  const due = newsForChat();
  if (due.length === 0) return 0;
  await connectToDatabase();
  const posted = new Set((await ChatNewsPost.find({ newsId: { $in: due.map((n) => n.id) } }).select("newsId").lean()).map((p) => p.newsId));
  const todo = due.filter((n) => !posted.has(n.id));
  if (todo.length === 0) return 0;
  const { ensureGeneralRoom } = await import("./core");
  const room = await ensureGeneralRoom();
  let count = 0;
  for (const n of todo) {
    // Claim first (unique index): two processes never post the same announcement
    try {
      await ChatNewsPost.create({ newsId: n.id, at: new Date() });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) continue;
      throw e;
    }
    const text = [n.title, ...n.slides.map((s) => `${s.title} — ${s.text}`)].join("\n\n").slice(0, 2000);
    const msg = await ChatMessage.create({
      roomId: room._id,
      senderId: new mongoose.Types.ObjectId(SYSTEM_SENDER_ID),
      senderName: SYSTEM_SENDER_NAME,
      senderRole: "mentor",
      text,
      news: n.id,
    });
    await ChatRoom.updateOne({ _id: room._id }, { $set: { lastMessageAt: msg.createdAt, lastMessage: { text: `📢 ${n.title}`.slice(0, 120), senderName: SYSTEM_SENDER_NAME } } });
    count++;
  }
  return count;
}
