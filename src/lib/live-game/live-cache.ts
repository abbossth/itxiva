import mongoose from "mongoose";
import { LiveGame, type ILiveGame } from "@/lib/db/models/live-game.model";
import { LiveGamePlayer, type ILiveGamePlayer } from "@/lib/db/models/live-game-player.model";
import { Group } from "@/lib/db/models/group.model";

// Jonli o'yinning umumiy holati (o'yin + barcha o'yinchilar) har server nusxasida qisqa muddat saqlanadi.
// 100 o'quvchi har 1,5 soniyada holat so'raganda bazaga ~200 ta so'rov/s o'rniga o'yin uchun ~2,5 ta so'rov/s ketadi
// (Atlas M0 ~100 op/s bilan cheklangan). Bir vaqtda kelgan so'rovlar bitta yuklashni kutadi.
// O'quvchining O'Z yozuvi (javob berdimi, ochkosi) har so'rovda alohida, yangi o'qiladi — kechikish faqat boshqalarda.

type LeanGame = ILiveGame & { _id: mongoose.Types.ObjectId; createdAt?: Date };
type LeanPlayer = ILiveGamePlayer & { _id: mongoose.Types.ObjectId; createdAt?: Date };

export interface LiveSnapshot {
  game: LeanGame;
  players: LeanPlayer[];
  groupName: string;
}

const TTL_MS = process.env.VITEST ? 0 : 400;
const GROUP_TTL_MS = 60_000;

const snaps = new Map<string, { at: number; p: Promise<LiveSnapshot | null> }>();
const groupNames = new Map<string, { at: number; name: string }>();

async function groupName(id: string): Promise<string> {
  const c = groupNames.get(id);
  if (c && Date.now() - c.at < GROUP_TTL_MS) return c.name;
  const g = await Group.findById(id).select("name").lean();
  const name = g?.name ?? "";
  if (groupNames.size > 500) groupNames.clear();
  groupNames.set(id, { at: Date.now(), name });
  return name;
}

async function load(gameId: string): Promise<LiveSnapshot | null> {
  const [game, players] = await Promise.all([
    LiveGame.findById(gameId).lean<LeanGame>(),
    LiveGamePlayer.find({ gameId }).lean<LeanPlayer[]>(),
  ]);
  if (!game) return null;
  return { game, players, groupName: await groupName(game.groupId.toString()) };
}

/** O'yin va o'yinchilar (≤400 ms eski bo'lishi mumkin) */
export function liveSnapshot(gameId: string): Promise<LiveSnapshot | null> {
  const now = Date.now();
  const c = snaps.get(gameId);
  if (c && now - c.at < TTL_MS) return c.p;
  const p = load(gameId).catch((err) => {
    snaps.delete(gameId);
    throw err;
  });
  if (snaps.size > 200) {
    for (const [k, v] of snaps) if (now - v.at > 5000) snaps.delete(k);
  }
  snaps.set(gameId, { at: now, p });
  return p;
}

/** Shu server nusxasidagi keshni darhol eskirgan deb belgilash (o'yin holatini o'zgartirgandan keyin) */
export function invalidateLiveSnapshot(gameId: string) {
  snaps.delete(String(gameId));
}
