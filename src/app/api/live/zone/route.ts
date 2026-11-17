import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { liveWho } from "@/lib/live-game/route-auth";
import { loadZoneGame, watchZone, zoneTick, type ZoneTickInput } from "@/lib/live-game/zone-server";

// "Yashil zona" uchun tezkor yo'l: o'quvchi soniyasiga ~4 marta robotining joyini yuboradi va boshqalarni oladi;
// proyektor esa hamma robotlarni o'qiydi. To'lqin natijalari shu so'rovlar ichida hisoblanadi.

export const dynamic = "force-dynamic";

const err = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
const ok = (data: unknown) => NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const user = await liveWho();
  if (!user || user.role !== "student") return err("Ruxsat berilmagan", 401);
  let body: { gameId?: unknown } & ZoneTickInput;
  try {
    body = await req.json();
  } catch {
    return err("Noto'g'ri so'rov", 400);
  }
  const gameId = body?.gameId;
  if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return err("O'yin topilmadi", 404);
  await connectToDatabase();
  const game = await loadZoneGame(gameId);
  if (!game || game.groupId.toString() !== String(user.groupId ?? "")) return err("O'yin topilmadi", 404);
  if (game.status !== "zone" || !game.zone) return err("Raund tugagan", 409);
  const res = await zoneTick(game, user.userId, body);
  if (!res) return err("Bu raundda qatnashmayapsiz", 403);
  return ok(res);
}

/** Proyektor: hamma robotlar */
export async function GET(req: NextRequest) {
  const user = await liveWho();
  if (!user || user.role !== "mentor") return err("Ruxsat berilmagan", 401);
  const gameId = req.nextUrl.searchParams.get("gameId");
  if (!gameId || !mongoose.isValidObjectId(gameId)) return err("O'yin topilmadi", 404);
  await connectToDatabase();
  return ok(await watchZone(gameId));
}
