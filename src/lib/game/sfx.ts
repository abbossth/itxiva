// One entry point for game sounds with a global mute (saved per device). Games call playSfx("…");
// the synthesized sounds themselves live in lib/sound.ts. Music is never auto-played from here.

import {
  playCorrectSound,
  playFanfare,
  playHeartbeat,
  playSeatTaken,
  playShutdown,
  playSplash,
  playStarPickup,
  playSurvive,
  playTickSound,
  playWhoosh,
  playWrongSound,
  playZap,
  playZoneAppear,
  playZoneClose,
  playZoneFull,
} from "@/lib/sound";

export type SfxName =
  | "correct"
  | "wrong"
  | "coin"
  | "jump"
  | "click"
  | "win"
  | "winGrand"
  | "tick"
  | "whoosh"
  | "heartbeat"
  | "seat"
  | "full"
  | "zap"
  | "splash"
  | "star"
  | "survive"
  | "out"
  | "appear"
  | "close";

const PLAY: Record<SfxName, (arg?: number) => void> = {
  correct: playCorrectSound,
  wrong: playWrongSound,
  coin: playStarPickup,
  jump: () => playWhoosh(0.3),
  click: playTickSound,
  win: () => playFanfare(false),
  winGrand: () => playFanfare(true),
  tick: playTickSound,
  whoosh: (v) => playWhoosh(v ?? 0.6),
  heartbeat: playHeartbeat,
  seat: playSeatTaken,
  full: playZoneFull,
  zap: playZap,
  splash: playSplash,
  star: playStarPickup,
  survive: playSurvive,
  out: playShutdown,
  appear: (n) => playZoneAppear(n ?? 1),
  close: playZoneClose,
};

const KEY = "itxiva:sfx-muted";
let muted: boolean | null = null;
const listeners = new Set<() => void>();

export function isSfxMuted(): boolean {
  if (muted === null) {
    try {
      muted = typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setSfxMuted(v: boolean) {
  muted = v;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the toggle still works for this page
  }
  for (const l of listeners) l();
}

export function subscribeSfx(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Play a named game sound unless muted. `arg` is passed to sounds that take one (e.g. zone count). */
export function playSfx(name: SfxName, arg?: number) {
  if (isSfxMuted()) return;
  try {
    PLAY[name](arg);
  } catch {
    // Audio problems must never break the game loop
  }
}
