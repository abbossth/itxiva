import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { getLivePlayerStateAction } from "@/actions/live-game.actions";

// O'quvchi ekranining holat so'rovi (har ~1,5 s). Server action emas, oddiy GET:
// - brauzer server action'larni navbat bilan yuboradi — sekin internetda so'rovlar to'planib, javob tugmasi ham kutib qolardi;
// - deploydan keyin eski sahifa ham ishlayveradi.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Sessiya tugagan bo'lsa — redirect emas, 401: ekran buni "internet sust" deb o'ylamay, login sahifasiga o'tkazadi
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || user.role !== "student") {
    return NextResponse.json({ success: false, error: "Qayta kiring" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const res = await getLivePlayerStateAction(req.nextUrl.searchParams.get("gameId") ?? "");
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
