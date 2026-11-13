// "Kiber jang" server qismi: har o'yinchi ~4-5 marta/soniyada o'z joylashuvi, otgan o'qlari va tekkizganlarini yuboradi.
// Jonni faqat server ayiradi (atomik shartli yangilash: qalqon, daxlsizlik, tiriklik tekshiriladi).
// Sovg'alarni birinchi yetib kelgan oladi. Bir zumda ko'p so'rov bo'lgani uchun o'yin va o'yinchilar qisqa keshlanadi.

import mongoose from "mongoose";
import { LiveGame, type ILiveArena, type ILiveArenaFeed, type ILiveArenaPickup } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer, type ILiveArenaPlayer } from "@/lib/db/models/live-game-player.model";
import type { PvpFeedView, PvpMe, PvpPeer, PvpTickInput, PvpTickResult, PvpWorld } from "./pvp-types";
import { hmacVerify, signTicket, type ArenaTicket } from "./arena-token";
import type { RoomResults } from "./pvp-room";
import {
  BULLET_RANGE,
  EMOTES,
  EMOTE_MS,
  HIT_GRACE_MS,
  mapOf,
  MAX_LIVES,
  MAX_PICKUPS,
  PICKUP_EVERY_MS,
  PICKUP_R,
  PLAYER_R,
  POWERS,
  SKINS,
  SPAWN_SHIELD_MS,
  TEAM_WIN_BONUS,
  freeSpot,
  pvpBonus,
  pvpLoadout,
  pvpStandings,
  rollPower,
  sameTeam,
  spawnPoint,
  teamArenaStandings,
  teamSpawn,
  type PowerKind,
} from "./pvp";

type Id = mongoose.Types.ObjectId | string;

export type { PvpFeedView, PvpMe, PvpPeer, PvpShotView, PvpTickInput, PvpTickResult, PvpWorld } from "./pvp-types";

// ---- Qisqa kesh (bir vaqtda o'nlab so'rov keladi) ----
const TTL = process.env.VITEST ? 0 : 150;
type CachedGame = { _id: mongoose.Types.ObjectId; groupId: mongoose.Types.ObjectId; status: string; arena?: ILiveArena | null };
type CachedPlayer = { _id: mongoose.Types.ObjectId; name: string; studentId: mongoose.Types.ObjectId; arena?: ILiveArenaPlayer | null; createdAt?: Date | string };
const gameCache = new Map<string, { at: number; v: CachedGame | null }>();
const playersCache = new Map<string, { at: number; v: CachedPlayer[] }>();

function sweep() {
  const old = Date.now() - 60_000;
  for (const [k, v] of gameCache) if (v.at < old) gameCache.delete(k);
  for (const [k, v] of playersCache) if (v.at < old) playersCache.delete(k);
}

export function invalidatePvp(gameId: Id) {
  gameCache.delete(String(gameId));
  playersCache.delete(String(gameId));
}

export async function loadPvpGame(gameId: Id): Promise<CachedGame | null> {
  const k = String(gameId);
  const c = gameCache.get(k);
  if (c && Date.now() - c.at < TTL) return c.v;
  const v = (await LiveGame.findById(gameId).select("groupId status arena").lean()) as CachedGame | null;
  if (gameCache.size > 200) sweep();
  gameCache.set(k, { at: Date.now(), v });
  return v;
}

async function loadPlayers(gameId: Id): Promise<CachedPlayer[]> {
  const k = String(gameId);
  const c = playersCache.get(k);
  if (c && Date.now() - c.at < TTL) return c.v;
  const v = (await LiveGamePlayer.find({ gameId, arena: { $ne: null } }).select("name studentId arena createdAt").lean()) as CachedPlayer[];
  playersCache.set(k, { at: Date.now(), v });
  return v;
}

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

const POWER_FIELDS: Record<Exclude<PowerKind, "heart">, "shieldUntil" | "speedUntil" | "rapidUntil" | "tripleUntil"> = {
  shield: "shieldUntil",
  speed: "speedUntil",
  rapid: "rapidUntil",
  triple: "tripleUntil",
};

function activePowers(a: ILiveArenaPlayer, now: number): PowerKind[] {
  return (Object.keys(POWER_FIELDS) as (keyof typeof POWER_FIELDS)[]).filter((k) => (a[POWER_FIELDS[k]] ?? 0) > now);
}

// ---- Boshlash va yakunlash ----

/** Arena boshlanadi: har o'yinchiga jon (to'g'ri javoblarga qarab), qurol, qahramon va joy beriladi */
export async function setupPvp(gameId: Id, startedAt: Date, teams = false, mapId: string | null = null) {
  const map = mapOf(mapId);
  const players = await LiveGamePlayer.find({ gameId }).select("answers createdAt team").sort({ createdAt: 1 }).lean();
  const start = startedAt.getTime();
  // Jamoaviy arenada: har jamoa o'z burchagidan, a'zolar yonma-yon
  const teamIndex = new Map<number, number>();
  if (players.length > 0) {
    await LiveGamePlayer.bulkWrite(
      players.map((p, i) => {
        const load = pvpLoadout(p.answers.filter((a) => a.isCorrect).length);
        const team = teams ? Math.max(0, p.team ?? 0) : -1;
        const k = teamIndex.get(team) ?? 0;
        teamIndex.set(team, k + 1);
        const pos = teams ? teamSpawn(team, k, map) : spawnPoint(i, map);
        const arena: ILiveArenaPlayer = {
          lives: load.lives,
          maxLives: load.lives,
          kills: 0,
          hits: 0,
          hitsTaken: 0,
          out: false,
          outAt: null,
          killedBy: null,
          skin: SKINS[i % SKINS.length].id,
          weapon: load.weapon,
          cooldown: load.cooldown,
          x: pos.x,
          y: pos.y,
          a: Math.atan2(map.h / 2 - pos.y, map.w / 2 - pos.x),
          shieldUntil: start + SPAWN_SHIELD_MS,
          speedUntil: 0,
          rapidUntil: 0,
          tripleUntil: 0,
          hitUntil: 0,
          shots: [],
          used: [],
          points: 0,
          place: 0,
          team,
          emote: -1,
          emoteAt: 0,
        };
        return { updateOne: { filter: { _id: p._id }, update: { $set: { arena } } } };
      })
    );
  }
  // Boshida uchta sovg'a: markazda va yon tomonlarda
  const [c, l, r] = map.pickups;
  const pickups: ILiveArenaPickup[] = [
    { id: 1, kind: "triple", x: c.x, y: c.y },
    { id: 2, kind: "shield", x: l.x, y: l.y },
    { id: 3, kind: "speed", x: r.x, y: r.y },
  ];
  await LiveGame.updateOne({ _id: gameId }, { $set: { "arena.pickups": pickups, "arena.seq": pickups.length, "arena.nextPickupAt": start + PICKUP_EVERY_MS, "arena.feed": [] } });
  invalidatePvp(gameId);
}

/** Yakun: o'rinlar va bonus ochkolar (bir marta — chaqiruvchi shartli yangilash bilan kafolatlaydi) */
export async function finishPvp(gameId: Id, factor = 1): Promise<{ winnerTeam: number | null }> {
  const players = await LiveGamePlayer.find({ gameId, arena: { $ne: null } }).select("arena").lean();
  const rows = players.map((p) => ({ id: p._id, lives: p.arena!.lives, out: p.arena!.out, outAt: p.arena!.outAt ?? 0, kills: p.arena!.kills, team: p.arena!.team ?? -1 }));
  // Jamoaviy arena: o'rin — jamoa o'rni; g'olib jamoaning har a'zosi (yiqilganlar ham) bonus oladi
  if (rows.some((r) => r.team >= 0)) {
    const teams = teamArenaStandings(rows);
    // Raqib jamoa bo'lmasa — g'olib ham yo'q
    const winner = teams.length >= 2 ? teams[0].team : null;
    const placeOf = new Map(teams.map((t, i) => [t.team, i + 1]));
    await Promise.all(
      rows.map((r) => {
        const pts = Math.round((pvpBonus(r.kills, !r.out, false) + (r.team === winner ? TEAM_WIN_BONUS : 0)) * factor);
        return LiveGamePlayer.updateOne({ _id: r.id }, { $inc: { score: pts }, $set: { "arena.points": pts, "arena.place": placeOf.get(r.team) ?? teams.length + 1 } });
      })
    );
    invalidatePvp(gameId);
    return { winnerTeam: winner };
  }
  const alive = rows.filter((r) => !r.out).length;
  const ordered = pvpStandings(rows);
  await Promise.all(
    ordered.map((r, i) => {
      const pts = Math.round(pvpBonus(r.kills, !r.out, alive === 1 && !r.out && rows.length >= 2) * factor);
      return LiveGamePlayer.updateOne({ _id: r.id }, { $inc: { score: pts }, $set: { "arena.points": pts, "arena.place": i + 1 } });
    })
  );
  invalidatePvp(gameId);
  return { winnerTeam: null };
}

// ---- Ko'rinish ----

export function pvpWorld(game: CachedGame, players: CachedPlayer[], meId: string | null, now = Date.now()): PvpWorld {
  const a = game.arena!;
  const start = new Date(a.startedAt).getTime();
  const peers: PvpPeer[] = players
    .filter((p) => p.arena)
    .map((p) => {
      const s = p.arena!;
      const isMe = String(p._id) === meId;
      return {
        id: String(p._id),
        name: p.name,
        skin: s.skin,
        x: s.x,
        y: s.y,
        a: s.a,
        lives: s.lives,
        maxLives: s.maxLives,
        out: s.out,
        kills: s.kills,
        shield: s.shieldUntil > now,
        powers: activePowers(s, now),
        shots: isMe ? [] : (s.shots ?? []).filter((x) => now - x.at < 900).map((x) => ({ id: x.id, x: x.x, y: x.y, a: x.a, age: Math.max(0, now - x.at) })),
        isMe,
        team: s.team ?? -1,
        emote: (s.emote ?? -1) >= 0 && now - (s.emoteAt ?? 0) < EMOTE_MS ? s.emote ?? -1 : -1,
      };
    });
  return {
    startsInMs: Math.max(0, start - now),
    remainingMs: Math.max(0, new Date(a.endsAt).getTime() - now),
    ended: Boolean(a.endedAt),
    peers,
    pickups: a.pickups ?? [],
    feed: (a.feed ?? [])
      .slice(-8)
      .reverse()
      .map((f: ILiveArenaFeed) => ({ key: `${f.at}:${f.kind}:${f.a}:${f.b ?? f.power}`, kind: f.kind, a: f.a, b: f.b ?? null, power: (f.power as PowerKind) ?? null, ago: now - f.at })),
    alive: peers.filter((p) => !p.out).length,
    total: peers.length,
    map: mapOf(a.map).id,
  };
}

export function pvpMeOf(p: CachedPlayer, now = Date.now()): PvpMe {
  const s = p.arena!;
  const left = (until: number) => Math.max(0, (until ?? 0) - now);
  return {
    id: String(p._id),
    name: p.name,
    skin: s.skin,
    weapon: s.weapon,
    cooldown: s.cooldown,
    lives: s.lives,
    maxLives: s.maxLives,
    out: s.out,
    killedBy: s.killedBy ?? null,
    kills: s.kills,
    hits: s.hits,
    x: s.x,
    y: s.y,
    powers: { shield: left(s.shieldUntil), speed: left(s.speedUntil), rapid: left(s.rapidUntil), triple: left(s.tripleUntil) },
    points: s.points,
    place: s.place,
  };
}

/** Proyektor uchun butun maydon */
export async function watchPvp(gameId: Id): Promise<PvpWorld | null> {
  const game = await loadPvpGame(gameId);
  if (!game?.arena || game.status !== "arena") return null;
  return pvpWorld(game, await loadPlayers(gameId), null);
}

// ---- Bir qadam ----

export async function pvpTick(game: CachedGame, studentId: Id, input: PvpTickInput): Promise<PvpTickResult | null> {
  const a = game.arena!;
  const now = Date.now();
  const start = new Date(a.startedAt).getTime();
  const end = new Date(a.endsAt).getTime();
  const playing = !a.endedAt && now >= start - 300 && now <= end + 2000;

  const map = mapOf(a.map);
  const x = num(input?.x, PLAYER_R, map.w - PLAYER_R, map.w / 2);
  const y = num(input?.y, PLAYER_R, map.h - PLAYER_R, map.h / 2);
  const em = Number(input?.em);
  const emote = Number.isInteger(em) && em >= 0 && em < EMOTES.length ? em : null;
  const ang = num(input?.a, -7, 7, 0);
  const incoming = (Array.isArray(input?.shots) ? input.shots : [])
    .slice(0, 10)
    .filter((s) => Number.isInteger(s?.id))
    .map((s) => ({ id: s.id, x: num(s.x, 0, map.w, x), y: num(s.y, 0, map.h, y), a: num(s.a, -7, 7, 0), at: now }));

  let before: CachedPlayer | null = null;
  if (playing && now >= start) {
    before = (await LiveGamePlayer.findOneAndUpdate(
      { gameId: game._id, studentId, arena: { $ne: null }, "arena.out": false },
      {
        $set: { "arena.x": Math.round(x), "arena.y": Math.round(y), "arena.a": Number(ang.toFixed(2)), ...(emote !== null ? { "arena.emote": emote, "arena.emoteAt": now } : {}) },
        ...(incoming.length > 0 ? { $push: { "arena.shots": { $each: incoming, $slice: -40 } } } : {}),
      },
      { returnDocument: "before", projection: { name: 1, studentId: 1, arena: 1 } }
    ).lean()) as CachedPlayer | null;
  }
  const meDoc = before ?? ((await LiveGamePlayer.findOne({ gameId: game._id, studentId }).select("name studentId arena").lean()) as CachedPlayer | null);
  if (!meDoc?.arena) return null;
  const meId = String(meDoc._id);

  let accepted = 0;
  let kills = 0;
  let claimed: PowerKind | null = null;
  let changed = false;
  const feed: ILiveArenaFeed[] = [];

  if (before) {
    changed = true;
    const players = await loadPlayers(game._id);
    // ---- Tekkizishlar ----
    const hits = (Array.isArray(input?.hits) ? input.hits : []).slice(0, 8);
    if (hits.length > 0) {
      const recent = new Map<number, { x: number; y: number }>();
      // Sekin internetda tekkani kechroq keladi — shuning uchun 3 soniyalik oyna
      for (const s of before.arena!.shots ?? []) if (now - s.at < 3000) recent.set(s.id, s);
      for (const s of incoming) recent.set(s.id, s);
      const used = new Set(before.arena!.used ?? []);
      const spent: number[] = [];
      for (const h of hits) {
        const shot = recent.get(Number(h?.shot));
        if (!shot || used.has(Number(h.shot)) || typeof h.target !== "string" || h.target === meId) continue;
        const target = players.find((p) => String(p._id) === h.target);
        if (!target?.arena || target.arena.out || sameTeam(before.arena!.team, target.arena.team)) continue;
        // Kechikish hisobga olingan holda: o'q chiqqan joydan nishongacha masofa o'q uchadigan masofadan oshmasin
        if (Math.hypot(target.arena.x - shot.x, target.arena.y - shot.y) > BULLET_RANGE + 260) continue;
        used.add(Number(h.shot));
        spent.push(Number(h.shot));
        const hit = await LiveGamePlayer.findOneAndUpdate(
          {
            _id: target._id,
            gameId: game._id,
            "arena.out": false,
            "arena.lives": { $gt: 0 },
            "arena.shieldUntil": { $lt: now },
            "arena.hitUntil": { $lt: now },
          },
          { $inc: { "arena.lives": -1, "arena.hitsTaken": 1 }, $set: { "arena.hitUntil": now + HIT_GRACE_MS } },
          { returnDocument: "after", projection: { name: 1, "arena.lives": 1 } }
        ).lean();
        if (!hit) continue;
        accepted++;
        if ((hit.arena?.lives ?? 1) <= 0) {
          const out = await LiveGamePlayer.updateOne(
            { _id: hit._id, "arena.out": false },
            { $set: { "arena.out": true, "arena.outAt": now, "arena.killedBy": meDoc.name } }
          );
          if (out.modifiedCount > 0) {
            kills++;
            feed.push({ at: now, kind: "kill", a: meDoc.name, b: hit.name });
          }
        }
      }
      if (spent.length > 0) {
        await LiveGamePlayer.updateOne(
          { _id: meDoc._id },
          { $push: { "arena.used": { $each: spent, $slice: -80 } }, $inc: { "arena.hits": accepted, "arena.kills": kills } }
        );
      }
    }

    // ---- Sovg'ani olish: birinchi yetib kelgan ----
    const claimId = Number(input?.claim);
    if (Number.isInteger(claimId)) {
      const pick = (a.pickups ?? []).find((p) => p.id === claimId);
      if (pick && Math.hypot(pick.x - x, pick.y - y) <= PICKUP_R + PLAYER_R + 50) {
        const pulled = await LiveGame.updateOne({ _id: game._id, "arena.pickups.id": claimId }, { $pull: { "arena.pickups": { id: claimId } } });
        if (pulled.modifiedCount > 0) {
          claimed = pick.kind;
          if (pick.kind === "heart") {
            await LiveGamePlayer.updateOne(
              { _id: meDoc._id, "arena.lives": { $lt: MAX_LIVES }, "arena.out": false },
              { $inc: { "arena.lives": 1 }, $max: { "arena.maxLives": Math.min(MAX_LIVES, before.arena!.lives + 1) } }
            );
          } else {
            await LiveGamePlayer.updateOne({ _id: meDoc._id }, { $set: { [`arena.${POWER_FIELDS[pick.kind]}`]: now + POWERS[pick.kind].ms } });
          }
          feed.push({ at: now, kind: "pickup", a: meDoc.name, power: pick.kind });
        }
      }
    }

    // ---- Yangi sovg'a ----
    const pickups = a.pickups ?? [];
    if (now >= (a.nextPickupAt ?? 0) && pickups.length < MAX_PICKUPS) {
      const spot = freeSpot(pickups, Math.random, map);
      if (spot) {
        await LiveGame.updateOne(
          { _id: game._id, "arena.nextPickupAt": a.nextPickupAt ?? 0, "arena.endedAt": null },
          {
            $set: { "arena.nextPickupAt": now + PICKUP_EVERY_MS },
            $inc: { "arena.seq": 1 },
            $push: { "arena.pickups": { id: (a.seq ?? 0) + 1, kind: rollPower(), x: spot.x, y: spot.y } },
          }
        );
      }
    }
    if (feed.length > 0) await LiveGame.updateOne({ _id: game._id }, { $push: { "arena.feed": { $each: feed, $slice: -20 } } });
    if (accepted > 0 || claimed || feed.length > 0) invalidatePvp(game._id);
  }

  const fresh = changed && (accepted > 0 || claimed)
    ? ((await LiveGamePlayer.findById(meDoc._id).select("name studentId arena").lean()) as CachedPlayer | null) ?? meDoc
    : before
    ? { ...meDoc, arena: { ...meDoc.arena!, x: Math.round(x), y: Math.round(y), a: ang, ...(emote !== null ? { emote, emoteAt: now } : {}) } }
    : meDoc;
  const latestGame = accepted > 0 || claimed ? (await loadPvpGame(game._id)) ?? game : game;
  const players = (await loadPlayers(game._id)).map((p) => (String(p._id) === meId ? fresh : p));
  return { world: pvpWorld(latestGame, players, meId, now), me: pvpMeOf(fresh, now), accepted, claimed };
}

// ---- Real vaqt xonasi (Cloudflare) bilan bog'lanish ----

/** Real vaqt xonasi sozlanganmi (Vercel muhit o'zgaruvchilari) */
export function arenaRealtimeEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ARENA_WS_URL && process.env.ARENA_SECRET);
}

/**
 * Xonaga ulanish manzili (imzolangan bilet bilan). Sozlanmagan yoki jang tugagan bo'lsa — null (o'yin HTTP yo'lida ishlaydi).
 * `player` berilmasa — proyektor uchun tomoshabin bileti.
 */
export async function arenaSocketUrl(
  game: { _id: unknown; arena?: ILiveArena | null },
  player: { _id: unknown; name: string; arena?: ILiveArenaPlayer | null } | null
): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_ARENA_WS_URL;
  const secret = process.env.ARENA_SECRET;
  const a = game.arena;
  if (!base || !secret || !a || a.endedAt || typeof a.round !== "number" || a.round < 0) return null;
  // Xarita uchun ovoz berish davomida jang hali yo'q
  if (a.voteEndsAt && !a.map) return null;
  const st = new Date(a.startedAt).getTime();
  const en = new Date(a.endsAt).getTime();
  const pa = player?.arena;
  if (player && !pa) return null;
  const ticket: ArenaTicket = pa
    ? {
        g: String(game._id),
        r: a.round,
        role: "player",
        p: String(player!._id),
        n: player!.name,
        skin: pa.skin,
        lives: pa.lives,
        maxLives: pa.maxLives,
        weapon: pa.weapon,
        cooldown: pa.cooldown,
        x: pa.x,
        y: pa.y,
        shieldUntil: pa.shieldUntil,
        team: pa.team ?? -1,
        m: mapOf(a.map).id,
        st,
        en,
        exp: en + 60_000,
      }
    : { g: String(game._id), r: a.round, role: "watch", p: "watch", n: "", skin: "", lives: 0, maxLives: 0, weapon: "", cooldown: 0, x: 0, y: 0, shieldUntil: 0, m: mapOf(a.map).id, st, en, exp: en + 60_000 };
  return `${base.replace(/\/$/, "")}/room/${String(game._id)}/${a.round}?t=${encodeURIComponent(await signTicket(secret, ticket))}`;
}

/** Xonadan kelgan natija (imzo bilan): jonlar, yiqitishlar va lenta Mongo'ga yoziladi — bonusni `finishPvp` hisoblaydi */
export async function applyRoomResults(raw: string, sig: string | null): Promise<{ status: number; error?: string }> {
  const secret = process.env.ARENA_SECRET;
  if (!secret || !sig || !(await hmacVerify(secret, raw, sig))) return { status: 401, error: "Imzo noto'g'ri" };
  let body: RoomResults;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400, error: "Noto'g'ri ma'lumot" };
  }
  if (!mongoose.isValidObjectId(body?.g) || !Number.isInteger(body?.r)) return { status: 400, error: "Noto'g'ri ma'lumot" };
  const game = await LiveGame.findById(body.g).select("status arena").lean();
  const a = game?.arena;
  if (!game || game.status !== "arena" || !a || a.endedAt || a.round !== body.r) return { status: 409, error: "Jang tugagan" };
  const n = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));
  const players = (Array.isArray(body.players) ? body.players : []).filter((p) => mongoose.isValidObjectId(p?.id)).slice(0, 80);
  if (players.length > 0) {
    await LiveGamePlayer.bulkWrite(
      players.map((p) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(p.id), gameId: game._id, arena: { $ne: null } },
          update: {
            $set: {
              "arena.lives": n(p.lives, 0, MAX_LIVES),
              "arena.maxLives": n(p.maxLives, 0, MAX_LIVES),
              "arena.kills": n(p.kills, 0, 200),
              "arena.hits": n(p.hits, 0, 2000),
              "arena.hitsTaken": n(p.hitsTaken, 0, 2000),
              "arena.out": Boolean(p.out),
              "arena.outAt": p.outAt ? n(p.outAt, 0, Number.MAX_SAFE_INTEGER) : null,
              "arena.killedBy": typeof p.killedBy === "string" ? p.killedBy.slice(0, 80) : null,
              "arena.x": n(p.x, 0, mapOf(a.map).w),
              "arena.y": n(p.y, 0, mapOf(a.map).h),
            },
          },
        },
      }))
    );
  }
  const feed = (Array.isArray(body.feed) ? body.feed : []).slice(-20).map((f) => ({
    at: n(f.at, 0, Number.MAX_SAFE_INTEGER),
    kind: f.kind === "kill" ? "kill" : "pickup",
    a: String(f.a ?? "").slice(0, 80),
    b: f.b ? String(f.b).slice(0, 80) : null,
    power: f.power ? String(f.power).slice(0, 12) : null,
  }));
  await LiveGame.updateOne({ _id: game._id, "arena.endedAt": null }, { $set: { "arena.feed": feed } });
  invalidatePvp(game._id);
  return { status: 200 };
}
