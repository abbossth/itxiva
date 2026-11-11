import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSession } from "@/lib/auth/session";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { loadPvpGame, pvpTick, watchPvp, type PvpTickInput } from "@/lib/live-game/pvp-server";

// "Kiber jang" uchun tezkor yo'l: har o'quvchi soniyasiga ~5 marta murojaat qiladi.
// Server action'lar brauzerda navbat bilan (bittadan) yuboriladi va deploydan keyin eski sahifada ishlamay qoladi —
// shuning uchun bu oddiy API: parallel, barqaror manzil, foydalanuvchi tekshiruvi qisqa keshlanadi.

export const dynamic = "force-dynamic";

type Who = { userId: string; role: string; groupId: string | null };
const whoCache = new Map<string, { at: number; v: Who | null }>();
const WHO_TTL = 10_000;

async function who(): Promise<Who | null> {
  const s = await getSession();
  if (!s) return null;
  const key = `${s.userId}:${s.sessionVersion ?? 0}:${s.role}`;
  const c = whoCache.get(key);
  if (c && Date.now() - c.at < WHO_TTL) return c.v;
  await connectToDatabase();
  const u = await User.findById(s.userId).select("groupId role mustChangePassword sessionVersion").lean();
  const ok = u && u.role === s.role && (u.sessionVersion ?? 0) === (s.sessionVersion ?? 0) && !u.mustChangePassword;
  const v: Who | null = ok ? { userId: s.userId, role: s.role, groupId: u.groupId ? u.groupId.toString() : null } : null;
  if (whoCache.size > 2000) whoCache.clear();
  whoCache.set(key, { at: Date.now(), v });
  return v;
}

const err = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
const ok = (data: unknown) => NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });

/** O'quvchi qadami */
export async function POST(req: NextRequest) {
  const user = await who();
  if (!user || user.role !== "student") return err("Ruxsat berilmagan", 401);
  let body: { gameId?: unknown; input?: PvpTickInput };
  try {
    body = await req.json();
  } catch {
    return err("Noto'g'ri so'rov", 400);
  }
  const gameId = body?.gameId;
  if (typeof gameId !== "string" || !mongoose.isValidObjectId(gameId)) return err("O'yin topilmadi", 404);
  await connectToDatabase();
  const game = await loadPvpGame(gameId);
  if (!game || game.groupId.toString() !== String(user.groupId ?? "")) return err("O'yin topilmadi", 404);
  if (game.status !== "arena" || !game.arena) return err("Arena tugagan", 409);
  const res = await pvpTick(game, user.userId, body.input ?? {});
  if (!res) return err("Avval o'yinga qo'shiling", 403);
  return ok(res);
}

/** Proyektor: butun maydon */
export async function GET(req: NextRequest) {
  const user = await who();
  if (!user || user.role !== "mentor") return err("Ruxsat berilmagan", 401);
  const gameId = req.nextUrl.searchParams.get("gameId");
  if (!gameId || !mongoose.isValidObjectId(gameId)) return err("O'yin topilmadi", 404);
  await connectToDatabase();
  return ok(await watchPvp(gameId));
}
