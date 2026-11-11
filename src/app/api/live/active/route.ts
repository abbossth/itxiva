import { NextResponse } from "next/server";
import { getMyActiveLiveGameAction } from "@/actions/live-game.actions";

// O'quvchi guruhida ochiq jonli o'yin bormi (header tugmasi va "o'yin boshlandi" oynasi uchun).
// Server action emas, oddiy API: deploydan keyin brauzerda qolgan eski sahifa ham buni chaqira oladi
// (eski sahifaning action ID'lari yangi build'da bo'lmaydi va tekshiruv jim to'xtab qolardi).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const game = await getMyActiveLiveGameAction();
    return NextResponse.json({ game }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("live active error:", error);
    return NextResponse.json({ game: null }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
