import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { ChatRoom } from "@/lib/db/models/chat.model";
import { User } from "@/lib/db/models/user.model";
import { canRead, canWrite, loadMessages, markRead } from "@/lib/chat/core";

// Xabarlar: ?room=ID&after=ID — yangilari (har ~2,5 s), ?before=ID — eskiroq tarix. Ko'rilgan joy o'qilgan deb belgilanadi.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ success: false, error: "Qayta kiring" }, { status: 401, headers: NO_STORE });
  const p = req.nextUrl.searchParams;
  const roomId = p.get("room") ?? "";
  if (!mongoose.isValidObjectId(roomId)) return NextResponse.json({ success: false, error: "Suhbat topilmadi" }, { status: 404, headers: NO_STORE });
  try {
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    const v = { userId: user.userId, role: user.role, groupId: user.groupId ?? null, fullName: user.fullName };
    if (!room || !canRead(room, v)) return NextResponse.json({ success: false, error: "Suhbat topilmadi" }, { status: 404, headers: NO_STORE });
    const messages = await loadMessages(room._id, { after: p.get("after"), before: p.get("before") });
    const last = messages[messages.length - 1];
    if (last && !p.get("before") && canWrite(room, v)) await markRead(room._id, user.userId, last.id);
    let mutedUntil: string | null = null;
    if (user.role === "student") {
      const me = await User.findById(user.userId).select("chatMutedUntil").lean();
      if (me?.chatMutedUntil && new Date(me.chatMutedUntil).getTime() > Date.now()) mutedUntil = new Date(me.chatMutedUntil).toISOString();
    }
    return NextResponse.json(
      { success: true, data: { messages, canWrite: canWrite(room, v), mutedUntil, kind: room.kind, ownerId: room.ownerId ? String(room.ownerId) : null } },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error("Chat messages error:", err);
    return NextResponse.json({ success: false, error: "Xabarlarni olib bo'lmadi" }, { status: 500, headers: NO_STORE });
  }
}
