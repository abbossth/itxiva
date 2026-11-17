import mongoose from "mongoose";
import { LiveGame, type ILiveGalaxy } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer, type ILiveGalaxyPlayer } from "@/lib/db/models/live-game-player.model";
import { MAX_ORBS, MAX_SPEED_CHECK, type GalaxyPeer } from "./galaxy";

// "Galaktika poygasi 3D" server qismi: har o'quvchi soniyasiga ~4 marta o'z masofasi, yonlama joyi va kristallarini
// yuboradi va javobda boshqa kemalarni oladi. Masofa vaqtga nisbatan cheklanadi (eng katta tezlikdan oshib bo'lmaydi).
// Bir zumda o'nlab so'rov keladi — o'yin va o'yinchilar ro'yxati qisqa keshlanadi. Bu fayl "use server" emas.

type Id = mongoose.Types.ObjectId | string;
const TTL = process.env.VITEST ? 0 : 150;

type CachedGame = { _id: mongoose.Types.ObjectId; groupId: mongoose.Types.ObjectId; status: string; galaxy?: ILiveGalaxy | null };
type CachedPlayer = { _id: mongoose.Types.ObjectId; name: string; studentId: mongoose.Types.ObjectId; galaxy?: ILiveGalaxyPlayer | null };
const gameCache = new Map<string, { at: number; v: CachedGame | null }>();
const playersCache = new Map<string, { at: number; v: CachedPlayer[] }>();

function sweep() {
  const old = Date.now() - 60_000;
  for (const [k, v] of gameCache) if (v.at < old) gameCache.delete(k);
  for (const [k, v] of playersCache) if (v.at < old) playersCache.delete(k);
}

export async function loadGalaxyGame(gameId: Id): Promise<CachedGame | null> {
  const key = String(gameId);
  const c = gameCache.get(key);
  if (c && Date.now() - c.at < TTL) return c.v;
  const v = await LiveGame.findById(gameId).select("groupId status galaxy").lean<CachedGame>();
  sweep();
  gameCache.set(key, { at: Date.now(), v });
  return v;
}

async function loadRacers(gameId: Id, round: number): Promise<CachedPlayer[]> {
  const key = `${gameId}:${round}`;
  const c = playersCache.get(key);
  if (c && Date.now() - c.at < TTL) return c.v;
  const v = await LiveGamePlayer.find({ gameId, "galaxy.round": round }).select("name studentId galaxy").lean<CachedPlayer[]>();
  playersCache.set(key, { at: Date.now(), v });
  return v;
}

export interface GalaxyTickInput {
  round?: unknown;
  d?: unknown;
  x?: unknown;
  orbs?: unknown;
}

export type { GalaxyPeer };

export interface GalaxyTickResult {
  peers: GalaxyPeer[];
  place: number;
  total: number;
  remainingMs: number;
  ended: boolean;
}

const num = (v: unknown, min: number, max: number, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** O'quvchi qadami: o'z holatini yozadi va boshqalarni oladi. null — o'yinchi bu poygada yo'q */
export async function galaxyTick(game: CachedGame, studentId: string, input: GalaxyTickInput): Promise<GalaxyTickResult | null> {
  const g = game.galaxy;
  if (!g) return null;
  const round = Number(input.round);
  const now = Date.now();
  const start = new Date(g.startedAt).getTime();
  const end = new Date(g.endsAt).getTime();
  const racers = await loadRacers(game._id, g.round);
  const me = racers.find((p) => p.studentId.toString() === studentId);
  if (!me?.galaxy) return null;

  let myD = me.galaxy.d ?? 0;
  if (round === g.round && !g.endedAt && now >= start - 500 && now <= end + 1500) {
    // Masofa vaqtga nisbatan cheklanadi: eng katta tezlik bilan ham bundan uzoq uchib bo'lmaydi
    const maxD = (Math.max(0, Math.min(now, end) - start) / 1000) * MAX_SPEED_CHECK + 20;
    const d = Math.round(num(input.d, 0, maxD) * 10) / 10;
    const x = Math.round(num(input.x, -1, 1) * 1000) / 1000;
    const orbs = Math.floor(num(input.orbs, 0, MAX_ORBS));
    await LiveGamePlayer.updateOne(
      { _id: me._id, "galaxy.round": g.round },
      { $max: { "galaxy.d": d, "galaxy.orbs": orbs }, $set: { "galaxy.x": x } }
    );
    myD = Math.max(myD, d);
  }

  const peers: GalaxyPeer[] = racers
    .filter((p) => p._id.toString() !== me._id.toString() && p.galaxy)
    .map((p) => [p._id.toString(), p.name, Math.round((p.galaxy!.d ?? 0) * 10) / 10, p.galaxy!.x ?? 0, p.galaxy!.ship ?? 0]);
  return {
    peers,
    place: 1 + peers.filter((p) => p[2] > myD).length,
    total: racers.length,
    remainingMs: Math.max(0, end - now),
    ended: Boolean(g.endedAt) || now > end,
  };
}
