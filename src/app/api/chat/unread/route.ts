import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { listRooms } from "@/lib/chat/core";

// Saytdagi bildirishnoma uchun (har ~20 s): o'qilmaganlar soni va eng so'nggi o'qilmagan suhbat
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

// Bir nechta tab/so'rov bir vaqtda kelsa — bir foydalanuvchi uchun natija 5 s qayta ishlatiladi
const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 5000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ success: false }, { status: 401, headers: NO_STORE });
  const hit = cache.get(user.userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ success: true, data: hit.data }, { headers: NO_STORE });
  try {
    const rooms = await listRooms({ userId: user.userId, role: user.role, groupId: user.groupId ?? null, fullName: user.fullName });
    // Ovozsiz suhbatlar bildirishnoma va umumiy sonda hisobga olinmaydi
    const unread = rooms.filter((r) => r.unread > 0 && !r.muted);
    // Pastki paneldagi avatarlar: avval o'qilmaganlar, keyin eng so'nggi suhbatlar
    const recent = [...rooms]
      .filter((r) => r.lastAt)
      .sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
      .slice(0, 3)
      .map((r) => ({ id: r.id, title: r.title, kind: r.kind }));
    const latest = unread.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))[0] ?? null;
    const data = {
      total: unread.reduce((n, r) => n + r.unread, 0),
      recent,
      latest: latest ? { roomId: latest.id, title: latest.title, text: latest.lastText ?? "", at: latest.lastAt } : null,
    };
    if (cache.size > 2000) cache.clear();
    cache.set(user.userId, { at: Date.now(), data });
    return NextResponse.json({ success: true, data }, { headers: NO_STORE });
  } catch (e) {
    console.error("Chat unread error:", e);
    return NextResponse.json({ success: false }, { status: 500, headers: NO_STORE });
  }
}
