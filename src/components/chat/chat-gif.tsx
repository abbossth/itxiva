"use client";

import { gifOf } from "@/lib/chat/media-catalog";
import type { GameLook } from "@/lib/character/catalog";
import { CharacterSvg, type CharMood } from "@/components/character/character-svg";
import { cn } from "@/lib/utils";

const ROW_MOOD: Record<string, CharMood> = { celebrate: "cheer", jump: "jump", run: "run", think: "think", sad: "sad", hit: "hit" };
const SCENE_ICON: Record<string, string> = { fireworks: "🎆", hearts: "💖", bulb: "💡", sleep: "😴", trophy: "🏆", rocket: "🚀" };

/**
 * GIF from our own pack: the sender's own 3D character doing a move with a caption, or an animated scene.
 * Plays in a loop (it's a CSS/sprite animation, not a downloaded file).
 */
export function ChatGif({ id, look, size = 168, className }: { id: string; look?: GameLook | null; size?: number; className?: string }) {
  const g = gifOf(id);
  if (!g) return null;
  const party = "party" in g && g.party;
  return (
    <div className={cn("chat-gif relative overflow-hidden rounded-2xl", `chat-gif-${g.kind === "scene" ? g.scene : g.row}`, className)} style={{ width: size, height: size }}>
      <div aria-hidden className={cn("absolute inset-0", g.kind === "scene" ? "chat-gif-bg-scene" : party ? "chat-gif-bg-party" : "chat-gif-bg-char")} />
      {g.kind === "char" ? (
        <div className="absolute inset-x-0 bottom-6 flex justify-center">
          <CharacterSvg look={look ?? null} size={Math.round(size * 0.52)} mood={ROW_MOOD[g.row] ?? "cheer"} pedestal={false} />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="chat-gif-icon text-[64px] leading-none">{SCENE_ICON[g.scene]}</span>
          <span aria-hidden className="chat-gif-particles absolute inset-0" />
        </div>
      )}
      {party && <span aria-hidden className="chat-gif-particles absolute inset-0" />}
      <span className="chat-gif-caption absolute inset-x-0 bottom-1.5 text-center text-lg font-black text-white">{g.caption}</span>
      <span className="absolute left-2 top-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-white">GIF</span>
    </div>
  );
}
