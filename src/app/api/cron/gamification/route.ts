import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runGamificationCron } from "@/lib/gamification/cron";

// Gamifikatsiya yakunlari (haftalik masala, guruh chellenji, nishonlar). Kunlik cron ham chaqiradi;
// bu manzil qo'lda qayta ishga tushirish uchun. `Authorization: Bearer <CRON_SECRET>` shart.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Ruxsat berilmagan" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runGamificationCron()) });
  } catch (error) {
    console.error("Gamification cron error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
