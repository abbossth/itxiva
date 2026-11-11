import type { CSSProperties } from "react";
import type { LiveGameMode } from "@/lib/db/models/live-game.model";

// Har bir o'yin turining o'z "kiyimi": fon ranglari, maskot, kuy uslubi va intro.

export interface ModeTheme {
  /** Intro va sarlavhadagi katta belgi */
  emoji: string;
  /** Fon: uch rangli gradient */
  bg: [string, string, string];
  /** Fondagi ikki yorug' dog' */
  glow: [string, string];
  /** Asosiy rang (sarlavha, chiziqlar) */
  accent: string;
  /** Fonda suzib yuradigan kichik belgilar */
  floaters: string[];
  /** Kuy: tonallik siljishi (yarim ton), tezlik koeffitsienti, arpedjio tembri */
  music: { transpose: number; tempo: number; wave: OscillatorType; minor: boolean };
}

export const MODE_THEMES: Record<LiveGameMode, ModeTheme> = {
  classic: {
    emoji: "🔥",
    bg: ["#0b0f2a", "#1e1b4b", "#3b0764"],
    glow: ["rgba(249,115,22,0.22)", "rgba(236,72,153,0.18)"],
    accent: "#fb923c",
    floaters: ["⭐", "⚡", "🔥"],
    music: { transpose: 0, tempo: 1, wave: "square", minor: true },
  },
  team: {
    emoji: "🛡️",
    bg: ["#06132b", "#0c2a5b", "#172554"],
    glow: ["rgba(56,189,248,0.22)", "rgba(99,102,241,0.2)"],
    accent: "#38bdf8",
    floaters: ["🛡️", "⚔️", "🏳️"],
    music: { transpose: -3, tempo: 0.95, wave: "sawtooth", minor: false },
  },
  survival: {
    emoji: "❤️",
    bg: ["#1a0508", "#3f0d12", "#450a0a"],
    glow: ["rgba(244,63,94,0.24)", "rgba(251,113,133,0.14)"],
    accent: "#fb7185",
    floaters: ["❤️", "💀", "🩸"],
    music: { transpose: -5, tempo: 1.05, wave: "sawtooth", minor: true },
  },
  chest: {
    emoji: "💎",
    bg: ["#1a1203", "#3b2a06", "#422006"],
    glow: ["rgba(250,204,21,0.22)", "rgba(245,158,11,0.18)"],
    accent: "#facc15",
    floaters: ["💎", "🪙", "🗝️"],
    music: { transpose: 2, tempo: 1, wave: "triangle", minor: false },
  },
  arena: {
    emoji: "🎯",
    bg: ["#070b18", "#1a0b2e", "#2e0a3d"],
    glow: ["rgba(217,70,239,0.24)", "rgba(34,211,238,0.18)"],
    accent: "#e879f9",
    floaters: ["🎯", "💥", "🛡️"],
    music: { transpose: -2, tempo: 1.12, wave: "square", minor: true },
  },
  race: {
    emoji: "🤖",
    bg: ["#03141a", "#063040", "#0c4a6e"],
    glow: ["rgba(34,211,238,0.24)", "rgba(163,230,53,0.16)"],
    accent: "#22d3ee",
    floaters: ["🏁", "⚙️", "🔋"],
    music: { transpose: 3, tempo: 1.15, wave: "square", minor: false },
  },
  territory: {
    emoji: "🚩",
    bg: ["#04140c", "#0a2e1c", "#14532d"],
    glow: ["rgba(74,222,128,0.22)", "rgba(250,204,21,0.14)"],
    accent: "#4ade80",
    floaters: ["🚩", "🗺️", "🏰"],
    music: { transpose: -4, tempo: 0.92, wave: "triangle", minor: true },
  },
  rocket: {
    emoji: "🚀",
    bg: ["#020617", "#0f0a3a", "#1e1b4b"],
    glow: ["rgba(129,140,248,0.24)", "rgba(244,114,182,0.16)"],
    accent: "#a5b4fc",
    floaters: ["⭐", "🪐", "☄️"],
    music: { transpose: 5, tempo: 1.05, wave: "sine", minor: false },
  },
  bridge: {
    emoji: "🌉",
    bg: ["#031322", "#06304a", "#0e4c6b"],
    glow: ["rgba(56,189,248,0.22)", "rgba(45,212,191,0.18)"],
    accent: "#2dd4bf",
    floaters: ["🌊", "🐟", "🪵"],
    music: { transpose: 1, tempo: 0.98, wave: "triangle", minor: false },
  },
  gold: {
    emoji: "⛏️",
    bg: ["#140c03", "#2b1a07", "#3f2a0b"],
    glow: ["rgba(251,191,36,0.24)", "rgba(168,85,247,0.14)"],
    accent: "#fbbf24",
    floaters: ["🪙", "💎", "⛏️"],
    music: { transpose: -1, tempo: 1, wave: "sawtooth", minor: true },
  },
};

export function themeBackground(mode: LiveGameMode): CSSProperties {
  const t = MODE_THEMES[mode] ?? MODE_THEMES.classic;
  return { backgroundImage: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]} 55%, ${t.bg[2]})` };
}
