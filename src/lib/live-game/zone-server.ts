import mongoose from "mongoose";
import { LiveGame, type ILiveZone } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer, type ILiveZonePlayer } from "@/lib/db/models/live-game-player.model";
import { FIELD, LOCK_MS, MAX_STARS, RESOLVE_DELAY_MS, WAVE_MS, insideZone, zonePhase, zoneWaves, type ZonePeer } from "./zone";

// "Yashil zona" server qismi: har o'quvchi soniyasiga ~4 marta robotining joyini yuboradi va boshqalarni oladi.
// Joy tezlikka nisbatan cheklanadi (sakrab o'tib bo'lmaydi), zona yopilgan paytda (lock) qabul qilinmaydi.
// To'lqin natijasini server hisoblaydi: to'lqin tugagach saqlangan joyi zonadan tashqarida bo'lganlar o'chadi.
// Hisob bir marta (atomik hisoblagich `zone.resolved`) — o'quvchi va proyektor so'rovlaridan qaysi biri birinchi kelsa.
// Bu fayl "use server" emas.

type Id = mongoose.Types.ObjectId | string;
const TTL = process.env.VITEST ? 0 : 150;

type CachedGame = { _id: mongoose.Types.ObjectId; groupId: mongoose.Types.ObjectId; status: string; zone?: ILiveZone | null };
type CachedPlayer = { _id: mongoose.Types.ObjectId; name: string; studentId: mongoose.Types.ObjectId; zone?: ILiveZonePlayer | null };
const gameCache = new Map<string, { at: number; v: CachedGame | null }>();
const playersCache = new Map<string, { at: number; v: CachedPlayer[] }>();

function sweep() {
  const old = Date.now() - 60_000;
  for (const [k, v] of gameCache) if (v.at < old) gameCache.delete(k);
  for (const [k, v] of playersCache) if (v.at < old) playersCache.delete(k);
}

export async function loadZoneGame(gameId: Id): Promise<CachedGame | null> {
  const key = String(gameId);
  const c = gameCache.get(key);
  if (c && Date.now() - c.at < TTL) return c.v;
  const v = await LiveGame.findById(gameId).select("groupId status zone").lean<CachedGame>();
  sweep();
  gameCache.set(key, { at: Date.now(), v });
  return v;
}

async function loadRunners(gameId: Id, round: number, fresh = false): Promise<CachedPlayer[]> {
  const key = `${gameId}:${round}`;
  const c = playersCache.get(key);
  if (!fresh && c && Date.now() - c.at < TTL) return c.v;
  const v = await LiveGamePlayer.find({ gameId, "zone.round": round }).select("name studentId zone").lean<CachedPlayer[]>();
  playersCache.set(key, { at: Date.now(), v });
  return v;
}

/**
 * Tugagan to'lqinlar natijasi (bir marta): zonadan tashqaridagi robotlar o'chadi.
 * Qaytaradi: hisoblangan to'lqinlar soni.
 */
export async function resolveZoneWaves(game: CachedGame, now: number = Date.now()): Promise<number> {
  const z = game.zone;
  if (!z || z.endedAt) return z?.resolved ?? 0;
  const waves = zoneWaves(z.seed, Boolean(z.final));
  const start = new Date(z.startedAt).getTime();
  let resolved = z.resolved ?? 0;
  while (resolved < waves.length) {
    const waveEnd = start + resolved * (WAVE_MS + LOCK_MS) + WAVE_MS;
    if (now < waveEnd + RESOLVE_DELAY_MS) break;
    const claim = await LiveGame.updateOne(
      { _id: game._id, "zone.round": z.round, "zone.resolved": resolved },
      { $set: { "zone.resolved": resolved + 1 } }
    );
    if (claim.modifiedCount === 1) {
      const wave = waves[resolved];
      const runners = await loadRunners(game._id, z.round, true);
      const outIds = runners.filter((p) => p.zone && !p.zone.out && !insideZone(p.zone.x, p.zone.y, wave)).map((p) => p._id);
      if (outIds.length > 0) {
        await LiveGamePlayer.updateMany(
          { _id: { $in: outIds }, "zone.round": z.round, "zone.out": false },
          { $set: { "zone.out": true, "zone.outWave": resolved } }
        );
      }
      playersCache.delete(`${game._id}:${z.round}`);
    }
    resolved += 1;
  }
  if (resolved !== z.resolved) gameCache.delete(String(game._id));
  return resolved;
}

export interface ZoneTickInput {
  round?: unknown;
  x?: unknown;
  y?: unknown;
  stars?: unknown;
}

export interface ZoneTickResult {
  peers: ZonePeer[];
  /** Hisoblangan to'lqinlar */
  resolved: number;
  out: boolean;
  outWave: number;
  alive: number;
  total: number;
  /** Server qabul qilgan joy (cheklangan bo'lsa — tuzatish uchun) */
  x: number;
  y: number;
}

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const peersOf = (runners: CachedPlayer[], exceptId?: string): ZonePeer[] =>
  runners
    .filter((p) => p.zone && p._id.toString() !== exceptId)
    .map((p) => [p._id.toString(), p.name, Math.round(p.zone!.x * 10) / 10, Math.round(p.zone!.y * 10) / 10, p.zone!.color ?? 0, p.zone!.out ? 1 : 0]);

/** O'quvchi qadami: o'z joyini yozadi va boshqalarni oladi. null — bu raundda yo'q */
export async function zoneTick(game: CachedGame, studentId: string, input: ZoneTickInput): Promise<ZoneTickResult | null> {
  const z = game.zone;
  if (!z) return null;
  const now = Date.now();
  const resolved = await resolveZoneWaves(game, now);
  const runners = await loadRunners(game._id, z.round);
  const me = runners.find((p) => p.studentId.toString() === studentId);
  if (!me?.zone) return null;

  let { x, y } = me.zone;
  const waves = zoneWaves(z.seed, Boolean(z.final));
  const phase = zonePhase(new Date(z.startedAt).getTime(), now, waves.length);
  const moving = Number(input.round) === z.round && !z.endedAt && !me.zone.out && phase.wave >= 0 && !phase.lock && !phase.done;
  if (moving) {
    const wantX = num(input.x, 0, FIELD.w, x);
    const wantY = num(input.y, 0, FIELD.h, y);
    // Tezlik tekshiruvi: oxirgi joydan beri bundan uzoq yurib bo'lmaydi
    const dt = Math.max(0, Math.min(1500, now - (me.zone.at || now))) / 1000;
    const maxStep = me.zone.speed * dt * 1.35 + 2;
    const dx = wantX - x;
    const dy = wantY - y;
    const dist = Math.hypot(dx, dy);
    const k = dist > maxStep ? maxStep / dist : 1;
    x = Math.round((x + dx * k) * 100) / 100;
    y = Math.round((y + dy * k) * 100) / 100;
    const stars = Math.floor(num(input.stars, 0, MAX_STARS, 0));
    await LiveGamePlayer.updateOne(
      { _id: me._id, "zone.round": z.round, "zone.out": false },
      { $set: { "zone.x": x, "zone.y": y, "zone.at": now }, $max: { "zone.stars": stars } }
    );
  } else if (!me.zone.at || now - me.zone.at > 3000) {
    // Turgan joyida: tezlik tekshiruvi keyingi yurishda katta sakrashga yo'l qo'ymasin
    await LiveGamePlayer.updateOne({ _id: me._id, "zone.round": z.round }, { $set: { "zone.at": now } });
  }

  const alive = runners.filter((p) => p.zone && !p.zone.out).length;
  return {
    peers: peersOf(runners, me._id.toString()),
    resolved,
    out: me.zone.out,
    outWave: me.zone.outWave ?? -1,
    alive,
    total: runners.length,
    x,
    y,
  };
}

/** Proyektor: hamma robotlar (natijani ham hisoblaydi) */
export async function watchZone(gameId: Id): Promise<{ peers: ZonePeer[]; resolved: number; round: number } | null> {
  const game = await loadZoneGame(gameId);
  const z = game?.zone;
  if (!game || !z || game.status !== "zone") return null;
  const resolved = await resolveZoneWaves(game);
  return { peers: peersOf(await loadRunners(game._id, z.round)), resolved, round: z.round };
}
