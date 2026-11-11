import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { getLiveHostStateAction } from "@/actions/live-game.actions";

// Ustoz (proyektor) ekranining holat so'rovi (har ~1 s). Oddiy GET: ustozning tugmalari (server action)
// holat so'rovlari ortida navbatda kutib qolmaydi.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Sessiya tugagan bo'lsa — redirect emas, 401: ekran buni "internet sust" deb o'ylamay, login sahifasiga o'tkazadi
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || user.role !== "mentor") {
    return NextResponse.json({ success: false, error: "Qayta kiring" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const res = await getLiveHostStateAction(req.nextUrl.searchParams.get("gameId") ?? "");
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
