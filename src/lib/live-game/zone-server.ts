import mongoose from "mongoose";
import { LiveGame, type ILiveZone } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer, type ILiveZonePlayer } from "@/lib/db/models/live-game-player.model";
import { hmacVerify, signToken } from "./arena-token";
import {
  FIELD,
  MAX_STARS,
  RESOLVE_DELAY_MS,
  STARS_PER_WAVE,
  aliveAt,
  cappedMove,
  claimSeat,
  maxStep,
  seatCode,
  waveEndAt,
  zoneEliminated,
  zoneIndexAt,
  zonePhase,
  zoneSeats,
  zoneWave,
  zoneWaveCount,
  type ZonePeer,
  type ZoneSeat,
} from "./zone";
import type { ZoneRoomResults, ZoneTicket } from "./zone-room";

// "Yashil zona" server qismi.
// 1) Real vaqt xonasi (Cloudflare, `zone-room.ts`) sozlangan bo'lsa — robotlar WebSocket orqali yuradi, to'lqin natijasini
//    xona hisoblaydi va imzo bilan shu yerga yuboradi (`applyZoneResults`). Bu yerda faqat bilet beriladi.
// 2) Aks holda (yoki xonaga ulanib bo'lmasa) — HTTP yo'li: har o'quvchi soniyasiga ~5 marta joyini yuboradi.
//    Joy tezlikka nisbatan cheklanadi, zona yopiq paytda qabul qilinmaydi, joyni birinchi kirgan oladi.
//    Natija bir marta (atomik hisoblagich `zone.resolved`) — o'quvchi va proyektor so'rovlaridan qaysi biri birinchi kelsa.
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

function invalidate(gameId: Id, round: number) {
  gameCache.delete(String(gameId));
  playersCache.delete(`${gameId}:${round}`);
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

const seatOf = (z: ILiveZonePlayer): ZoneSeat => ({ wave: z.seatWave ?? -1, zone: z.seatZone ?? -1, at: z.seatAt ?? 0 });
const seatInputs = (runners: CachedPlayer[]) =>
  runners.filter((p) => p.zone).map((p) => ({ id: p._id.toString(), x: p.zone!.x, y: p.zone!.y, out: p.zone!.out, seat: seatOf(p.zone!) }));
const outWaves = (runners: CachedPlayer[]) => runners.filter((p) => p.zone).map((p) => (p.zone!.out ? p.zone!.outWave ?? 0 : -1));

/** w-to'lqin xaritasi (shu to'lqin boshidagi tiriklar soniga qarab) */
function layoutOf(z: ILiveZone, runners: CachedPlayer[], w: number) {
  return zoneWave(z.seed, Boolean(z.final), w, aliveAt(outWaves(runners), w));
}

/**
 * Tugagan to'lqinlar natijasi (bir marta): joysiz qolgan robotlar (zonadan tashqarida yoki zona to'lgan) o'chadi.
 * Real vaqt xonasida natijani xona hisoblaydi — `force` bo'lmasa bu yerda hisoblanmaydi.
 * Qaytaradi: hisoblangan to'lqinlar soni.
 */
export async function resolveZoneWaves(game: CachedGame, now: number = Date.now(), force = false): Promise<number> {
  const z = game.zone;
  if (!z || z.endedAt) return z?.resolved ?? 0;
  if (z.rt && !force) return z.resolved ?? 0;
  const waves = zoneWaveCount(Boolean(z.final));
  const start = new Date(z.startedAt).getTime();
  let resolved = z.resolved ?? 0;
  while (resolved < waves) {
    if (now < waveEndAt(start, resolved) + RESOLVE_DELAY_MS) break;
    const claim = await LiveGame.updateOne(
      { _id: game._id, "zone.round": z.round, "zone.resolved": resolved },
      { $set: { "zone.resolved": resolved + 1 } }
    );
    if (claim.modifiedCount === 1) {
      const runners = await loadRunners(game._id, z.round, true);
      const outIds = zoneEliminated(resolved, layoutOf(z, runners, resolved), seatInputs(runners));
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
  /** O'z joyi: 0 — zonada emas, z+1 — joyli, -(z+1) — joy yetmadi */
  seat: number;
  total: number;
  /** Server qabul qilgan joy (cheklangan bo'lsa — tuzatish uchun) */
  x: number;
  y: number;
  /** Server vaqti (telefon soatini moslash uchun) */
  now: number;
}

const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Hamma robotlar ekran uchun (joy holati — ko'rsatilayotgan to'lqin bo'yicha) */
function peersOf(z: ILiveZone, runners: CachedPlayer[], now: number): ZonePeer[] {
  const start = new Date(z.startedAt).getTime();
  const phase = zonePhase(start, now, zoneWaveCount(Boolean(z.final)));
  const seats = phase.wave >= 0 ? zoneSeats(phase.wave, layoutOf(z, runners, phase.wave), seatInputs(runners)) : null;
  return runners
    .filter((p) => p.zone)
    .map((p) => {
      const id = p._id.toString();
      return [
        id,
        p.name,
        Math.round(p.zone!.x * 10) / 10,
        Math.round(p.zone!.y * 10) / 10,
        p.zone!.color ?? 0,
        p.zone!.out ? (p.zone!.outWave ?? 0) + 1 : 0,
        seats ? seatCode(seats.get(id)) : 0,
      ];
    });
}

/** O'quvchi qadami (HTTP yo'li): o'z joyini yozadi va boshqalarni oladi. null — bu raundda yo'q */
export async function zoneTick(game: CachedGame, studentId: string, input: ZoneTickInput): Promise<ZoneTickResult | null> {
  const z = game.zone;
  if (!z) return null;
  const now = Date.now();
  const resolved = await resolveZoneWaves(game, now);
  let runners = await loadRunners(game._id, z.round);
  const me = runners.find((p) => p.studentId.toString() === studentId);
  if (!me?.zone) return null;

  let { x, y } = me.zone;
  const waves = zoneWaveCount(Boolean(z.final));
  const phase = zonePhase(new Date(z.startedAt).getTime(), now, waves);
  // Real vaqt xonasida joylarni xona boshqaradi — bu yo'l faqat ko'rsatadi
  const moving = !z.rt && Number(input.round) === z.round && !z.endedAt && !me.zone.out && phase.wave >= 0 && !phase.lock && !phase.done && phase.wave >= resolved;
  if (moving) {
    const next = cappedMove(x, y, num(input.x, 0, FIELD.w, x), num(input.y, 0, FIELD.h, y), maxStep(me.zone.speed, now - (me.zone.at || now)));
    x = next.x;
    y = next.y;
    const seat = claimSeat(seatOf(me.zone), phase.wave, zoneIndexAt(x, y, layoutOf(z, runners, phase.wave)), now);
    const stars = Math.floor(num(input.stars, 0, Math.min(MAX_STARS, (phase.wave + 1) * STARS_PER_WAVE), 0));
    await LiveGamePlayer.updateOne(
      { _id: me._id, "zone.round": z.round, "zone.out": false },
      { $set: { "zone.x": x, "zone.y": y, "zone.at": now, "zone.seatWave": seat.wave, "zone.seatZone": seat.zone, "zone.seatAt": seat.at }, $max: { "zone.stars": stars } }
    );
    // Shu so'rovdagi joy holati yangi joy bo'yicha ko'rinsin
    runners = runners.map((p) => (p._id.equals(me._id) ? { ...p, zone: { ...p.zone!, x, y, seatWave: seat.wave, seatZone: seat.zone, seatAt: seat.at } } : p));
  } else if (!z.rt && (!me.zone.at || now - me.zone.at > 3000)) {
    // Turgan joyida: tezlik tekshiruvi keyingi yurishda katta sakrashga yo'l qo'ymasin
    await LiveGamePlayer.updateOne({ _id: me._id, "zone.round": z.round }, { $set: { "zone.at": now } });
  }

  const all = peersOf(z, runners, now);
  const myId = me._id.toString();
  const mine = all.find((p) => p[0] === myId);
  return {
    peers: all.filter((p) => p[0] !== myId),
    resolved,
    out: me.zone.out,
    outWave: me.zone.outWave ?? -1,
    seat: mine?.[6] ?? 0,
    total: runners.length,
    x,
    y,
    now,
  };
}

/** Proyektor (HTTP yo'li): hamma robotlar (natijani ham hisoblaydi) */
export async function watchZone(gameId: Id): Promise<{ peers: ZonePeer[]; resolved: number; round: number; now: number } | null> {
  const game = await loadZoneGame(gameId);
  const z = game?.zone;
  if (!game || !z || game.status !== "zone") return null;
  const resolved = await resolveZoneWaves(game);
  const now = Date.now();
  return { peers: peersOf(z, await loadRunners(game._id, z.round), now), resolved, round: z.round, now };
}

// ---- Real vaqt xonasi (Cloudflare) bilan bog'lanish ----

let healthCache: { at: number; ok: boolean } | null = null;

/**
 * Xona sozlangan va ishlayaptimi (arena bilan bir xil Worker va kalit). Worker'da "Yashil zona" xonasi borligi
 * `/health/zone` dan tekshiriladi (natija 2 daqiqa keshlanadi): yo'q yoki javob bermasa — raund HTTP yo'lida o'tadi.
 */
export async function zoneRealtimeEnabled(): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_ARENA_WS_URL;
  if (!base || !process.env.ARENA_SECRET) return false;
  if (process.env.VITEST) return true;
  if (healthCache && Date.now() - healthCache.at < 120_000) return healthCache.ok;
  let ok = false;
  try {
    const url = `${base.replace(/\/$/, "").replace(/^ws/, "http")}/health/zone`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(1500) });
    ok = r.ok && (await r.text()).trim() === "ok";
  } catch {
    ok = false;
  }
  healthCache = { at: Date.now(), ok };
  return ok;
}

/**
 * Xonaga ulanish manzili (imzolangan bilet bilan). Xona yo'q yoki raund tugagan bo'lsa — null.
 * `player` berilmasa — proyektor uchun tomoshabin bileti.
 */
export async function zoneSocketUrl(
  game: { _id: unknown; zone?: ILiveZone | null },
  player: { _id: unknown; name: string; zone?: ILiveZonePlayer | null } | null
): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_ARENA_WS_URL;
  const secret = process.env.ARENA_SECRET;
  const z = game.zone;
  if (!base || !secret || !z?.rt || z.endedAt) return null;
  const pz = player?.zone;
  if (player && (!pz || pz.round !== z.round)) return null;
  const st = new Date(z.startedAt).getTime();
  const en = new Date(z.endsAt).getTime();
  const common = { k: "zone" as const, g: String(game._id), r: z.round, seed: z.seed, fin: Boolean(z.final), st, en, res: z.resolved ?? 0, exp: en + 60_000 };
  const ticket: ZoneTicket = pz
    ? { ...common, role: "player", p: String(player!._id), n: player!.name, c: pz.color ?? 0, sp: pz.speed, x: pz.x, y: pz.y, o: pz.out ? (pz.outWave ?? 0) + 1 : 0, s: pz.stars ?? 0 }
    : { ...common, role: "watch", p: "watch", n: "", c: 0, sp: 0, x: 0, y: 0, o: 0, s: 0 };
  return `${base.replace(/\/$/, "")}/zone/${String(game._id)}/${z.round}?t=${encodeURIComponent(await signToken(secret, ticket))}`;
}

/**
 * Xonadan kelgan natija (imzo bilan): joylar, o'chganlar va yulduzlar Mongo'ga yoziladi — ochkoni `endZone` hisoblaydi.
 * Xonaga umuman ulanmagan o'quvchi birinchi to'lqin hisoblangach o'chgan deb yoziladi (u zonaga kirmagan).
 */
export async function applyZoneResults(raw: string, sig: string | null): Promise<{ status: number; error?: string }> {
  const secret = process.env.ARENA_SECRET;
  if (!secret || !sig || !(await hmacVerify(secret, raw, sig))) return { status: 401, error: "Imzo noto'g'ri" };
  let body: ZoneRoomResults;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400, error: "Noto'g'ri ma'lumot" };
  }
  if (!mongoose.isValidObjectId(body?.g) || !Number.isInteger(body?.r)) return { status: 400, error: "Noto'g'ri ma'lumot" };
  const game = await LiveGame.findById(body.g).select("status zone").lean();
  const z = game?.zone;
  if (!game || game.status !== "zone" || !z || z.endedAt || z.round !== body.r) return { status: 409, error: "Raund tugagan" };
  const waves = zoneWaveCount(Boolean(z.final));
  const n = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || 0));
  const resolved = Math.round(n(body.resolved, 0, waves));
  const players = (Array.isArray(body.players) ? body.players : []).filter((p) => mongoose.isValidObjectId(p?.id)).slice(0, 120);
  if (players.length > 0) {
    await LiveGamePlayer.bulkWrite(
      players.map((p) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(p.id), gameId: game._id, "zone.round": z.round },
          update: {
            $set: {
              "zone.x": n(p.x, 0, FIELD.w),
              "zone.y": n(p.y, 0, FIELD.h),
              "zone.out": Boolean(p.out),
              "zone.outWave": p.out ? Math.round(n(p.outWave, 0, waves - 1)) : -1,
              "zone.seatWave": Math.round(n(p.seatWave, -1, waves)),
              "zone.seatZone": Math.round(n(p.seatZone, -1, 5)),
              "zone.seatAt": n(p.seatAt, 0, Number.MAX_SAFE_INTEGER),
            },
            $max: { "zone.stars": Math.floor(n(p.stars, 0, MAX_STARS)) },
          },
        },
      }))
    );
  }
  if (resolved >= 1) {
    await LiveGamePlayer.updateMany(
      { gameId: game._id, "zone.round": z.round, "zone.out": false, _id: { $nin: players.map((p) => new mongoose.Types.ObjectId(p.id)) } },
      { $set: { "zone.out": true, "zone.outWave": 0 } }
    );
  }
  await LiveGame.updateOne({ _id: game._id, "zone.round": z.round, "zone.endedAt": null, "zone.resolved": { $lt: resolved } }, { $set: { "zone.resolved": resolved } });
  invalidate(game._id, z.round);
  return { status: 200 };
}
