import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { liveWho } from "@/lib/live-game/route-auth";
import { galaxyTick, loadGalaxyGame, type GalaxyTickInput } from "@/lib/live-game/galaxy-server";

// "Galaktika poygasi 3D" uchun tezkor yo'l: har o'quvchi soniyasiga ~4 marta o'z kemasi holatini yuboradi
// va boshqa kemalarni oladi. Oddiy API (server action emas): parallel, deploydan keyin ham barqaror manzil.

export const dynamic = "force-dynamic";

const err = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const user = await liveWho();
  if (!user || user.role !== "student") return err("Ruxsat berilmagan", 401);
  let body: { gameId?: unknown } & GalaxyTickInput;
  try {
    body = await req.json();
  } catch {
    return err("Noto'g'ri so'rov", 400);
  }
  const gameId = body?.gameId;
  if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return err("O'yin topilmadi", 404);
  await connectToDatabase();
  const game = await loadGalaxyGame(gameId);
  if (!game || game.groupId.toString() !== String(user.groupId ?? "")) return err("O'yin topilmadi", 404);
  if (game.status !== "galaxy" || !game.galaxy) return err("Poyga tugagan", 409);
  const res = await galaxyTick(game, user.userId, body);
  if (!res) return err("Bu poygada qatnashmayapsiz", 403);
  return NextResponse.json({ success: true, data: res }, { headers: { "Cache-Control": "no-store" } });
}
