import { NextRequest, NextResponse } from "next/server";
import { getLiveHostStateAction } from "@/actions/live-game.actions";

// Ustoz (proyektor) ekranining holat so'rovi (har ~1 s). Oddiy GET: ustozning tugmalari (server action)
// holat so'rovlari ortida navbatda kutib qolmaydi.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = await getLiveHostStateAction(req.nextUrl.searchParams.get("gameId") ?? "");
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
