// "Kiber jang" ko'rinish turlari: server (Vercel), real vaqt xonasi (Cloudflare) va brauzer uchun umumiy.
// Mongoose'ga bog'liq emas.

import type { MapId, PowerKind } from "./pvp";

export interface PvpPickup {
  id: number;
  kind: PowerKind;
  x: number;
  y: number;
}

export interface PvpShotView {
  id: number;
  x: number;
  y: number;
  a: number;
  /** Necha ms oldin otilgan */
  age: number;
}

export interface PvpPeer {
  id: string;
  name: string;
  skin: string;
  x: number;
  y: number;
  a: number;
  lives: number;
  maxLives: number;
  out: boolean;
  kills: number;
  /** Qalqon (yoki boshlanishdagi himoya) bor — o'q tegmaydi */
  shield: boolean;
  powers: PowerKind[];
  shots: PvpShotView[];
  isMe: boolean;
  /** Jamoaviy arenada jamoa raqami; individualda -1 */
  team: number;
  /** Ko'rsatilayotgan emoji-reaksiya (EMOTES indeksi); -1 — yo'q */
  emote: number;
}

export interface PvpFeedView {
  key: string;
  kind: "kill" | "pickup";
  a: string;
  b: string | null;
  power: PowerKind | null;
  ago: number;
}

export interface PvpWorld {
  startsInMs: number;
  remainingMs: number;
  ended: boolean;
  peers: PvpPeer[];
  pickups: PvpPickup[];
  feed: PvpFeedView[];
  alive: number;
  total: number;
  /** Jang xaritasi */
  map: MapId;
}

export interface PvpMe {
  id: string;
  name: string;
  skin: string;
  weapon: string;
  cooldown: number;
  lives: number;
  maxLives: number;
  out: boolean;
  killedBy: string | null;
  kills: number;
  hits: number;
  x: number;
  y: number;
  /** Qolgan ms: qalqon, tezlik, tez otish, uchtalik */
  powers: Record<Exclude<PowerKind, "heart">, number>;
  points: number;
  place: number;
}

export interface PvpTickInput {
  x?: number;
  y?: number;
  a?: number;
  shots?: { id: number; x: number; y: number; a: number }[];
  hits?: { target: string; shot: number }[];
  claim?: number | null;
  /** Emoji-reaksiya (EMOTES indeksi) */
  em?: number | null;
}

export interface PvpTickResult {
  world: PvpWorld;
  me: PvpMe;
  /** Shu so'rovda qabul qilingan tekkizishlar */
  accepted: number;
  claimed: PowerKind | null;
}

