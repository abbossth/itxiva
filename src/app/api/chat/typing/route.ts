import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { ChatRoom } from "@/lib/db/models/chat.model";
import { canWrite, setTyping } from "@/lib/chat/core";

// "... yozmoqda": brauzer yozayotganda ~3 s da bir marta { room, on: true }, to'xtaganda { on: false } yuboradi
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ success: false }, { status: 401 });
  try {
    const body = (await req.json()) as { room?: unknown; on?: unknown };
    const roomId = typeof body.room === "string" ? body.room : "";
    if (!mongoose.isValidObjectId(roomId)) return NextResponse.json({ success: false }, { status: 404 });
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).select("kind groupId members").lean();
    const v = { userId: user.userId, role: user.role, groupId: user.groupId ?? null, fullName: user.fullName };
    if (!room || !canWrite(room, v)) return NextResponse.json({ success: false }, { status: 404 });
    await setTyping(roomId, v, body.on !== false);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
