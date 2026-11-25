import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { ChatRoom } from "@/lib/db/models/chat.model";
import { User } from "@/lib/db/models/user.model";
import { canRead, canWrite, loadChanged, loadMessages, markRead, markSeen, roomReaders, typingIn } from "@/lib/chat/core";
import { checkRateLimit } from "@/lib/rate-limit";

// Xabarlar: ?room=ID&after=ID — yangilari (har ~2,5 s), ?before=ID — eskiroq tarix. Ko'rilgan joy o'qilgan deb belgilanadi.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ success: false, error: "Qayta kiring" }, { status: 401, headers: NO_STORE });
  // Ochiq suhbat ~1,5–2,5 s da so'raydi; undan tez so'rovlar (bir nechta tab, xato kod) serverni bo'g'masin
  if (!checkRateLimit(`chat_poll_${user.userId}`, 120, 60_000).allowed) {
    return NextResponse.json({ success: false, error: "Juda tez" }, { status: 429, headers: NO_STORE });
  }
  const p = req.nextUrl.searchParams;
  const roomId = p.get("room") ?? "";
  if (!mongoose.isValidObjectId(roomId)) return NextResponse.json({ success: false, error: "Suhbat topilmadi" }, { status: 404, headers: NO_STORE });
  try {
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    const v = { userId: user.userId, role: user.role, groupId: user.groupId ?? null, fullName: user.fullName };
    if (!room || !canRead(room, v)) return NextResponse.json({ success: false, error: "Suhbat topilmadi" }, { status: 404, headers: NO_STORE });
    // Birinchi ochilishda — oxirgi 30 ta, keyin faqat yangilari; eskilari yuqoriga aylantirganda 30 tadan
    const messages = await loadMessages(room._id, { after: p.get("after"), before: p.get("before"), limit: 30 });
    const sinceRaw = Number(p.get("since"));
    const changed = Number.isFinite(sinceRaw) && sinceRaw > 0 ? await loadChanged(room._id, new Date(sinceRaw)) : [];
    const last = messages[messages.length - 1];
    if (!p.get("before") && canWrite(room, v)) {
      if (last) await markRead(room._id, user.userId, last.id);
      await markSeen(room._id, user.userId);
    }
    // O'qiganlar: ✓✓ va "kim o'qidi" (umumiy chatda ham — faqat ism va qayergacha o'qigani)
    const [readers, typing] = p.get("before") ? [[], []] : await Promise.all([roomReaders(room._id, user.userId), typingIn(room._id, user.userId)]);
    let mutedUntil: string | null = null;
    if (user.role === "student") {
      const me = await User.findById(user.userId).select("chatMutedUntil").lean();
      if (me?.chatMutedUntil && new Date(me.chatMutedUntil).getTime() > Date.now()) mutedUntil = new Date(me.chatMutedUntil).toISOString();
    }
    return NextResponse.json(
      { success: true, data: { messages, changed, now: Date.now(), readers, typing, canWrite: canWrite(room, v), mutedUntil, kind: room.kind, ownerId: room.ownerId ? String(room.ownerId) : null } },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error("Chat messages error:", err);
    return NextResponse.json({ success: false, error: "Xabarlarni olib bo'lmadi" }, { status: 500, headers: NO_STORE });
  }
}
