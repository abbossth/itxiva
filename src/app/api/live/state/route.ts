import { NextRequest, NextResponse } from "next/server";
import { getLivePlayerStateAction } from "@/actions/live-game.actions";

// O'quvchi ekranining holat so'rovi (har ~1,5 s). Server action emas, oddiy GET:
// - brauzer server action'larni navbat bilan yuboradi — sekin internetda so'rovlar to'planib, javob tugmasi ham kutib qolardi;
// - deploydan keyin eski sahifa ham ishlayveradi.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = await getLivePlayerStateAction(req.nextUrl.searchParams.get("gameId") ?? "");
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
