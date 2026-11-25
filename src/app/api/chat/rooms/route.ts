import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { listRooms } from "@/lib/chat/core";

// Chat xonalari ro'yxati (o'qilmaganlar soni bilan). ?watch=1 — mentor uchun kuzatuv (a'zo bo'lmagan guruhlar va shaxsiy xabarlar)
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ success: false, error: "Qayta kiring" }, { status: 401, headers: NO_STORE });
  try {
    const watch = req.nextUrl.searchParams.get("watch") === "1" && user.role === "mentor";
    const rooms = await listRooms({ userId: user.userId, role: user.role, groupId: user.groupId ?? null, fullName: user.fullName }, { watch });
    return NextResponse.json({ success: true, data: { rooms, me: user.userId, role: user.role } }, { headers: NO_STORE });
  } catch (err) {
    console.error("Chat rooms error:", err);
    return NextResponse.json({ success: false, error: "Ro'yxatni olib bo'lmadi" }, { status: 500, headers: NO_STORE });
  }
}
