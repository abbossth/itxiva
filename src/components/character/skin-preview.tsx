"use client";

import { useEffect, useState } from "react";
import type { GameLook } from "@/lib/character/catalog";
import { RARITY_LABELS, rarityColor, type Rarity } from "@/lib/game/skins";
import { alpha } from "@/lib/game/theme";
import { cn } from "@/lib/utils";
import { CharacterSvg, type CharMood } from "./character-svg";

/** Rarity frame: gray / blue / purple / gold (legendary gets an animated shine) */
export function RarityFrame({ rarity, className, children }: { rarity: Rarity; className?: string; children: React.ReactNode }) {
  const c = rarityColor(rarity);
  return (
    <div
      className={cn("relative rounded-2xl", rarity === "legendary" && "game-shine", className)}
      style={{ boxShadow: `inset 0 0 0 2px ${c}, 0 6px 16px -8px ${alpha(c, 0.7)}`, background: `linear-gradient(180deg, ${alpha(c, 0.16)}, ${alpha(c, 0.04)})` }}
    >
      {children}
    </div>
  );
}

export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  const c = rarityColor(rarity);
  return (
    <span className={cn("inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-black uppercase tracking-wide", className)} style={{ color: c, background: alpha(c, 0.14), boxShadow: `inset 0 0 0 1px ${alpha(c, 0.5)}` }}>
      {RARITY_LABELS[rarity]}
    </span>
  );
}

/**
 * Skin preview: idle (breathing, blinking) and a celebration demo in a loop. Reusable in the shop.
 * `play` = false keeps it still (e.g. small tiles until hovered).
 */
export function SkinPreview({ look, rarity, size = 120, play = true, className }: { look: Partial<GameLook>; rarity: Rarity; size?: number; play?: boolean; className?: string }) {
  const [mood, setMood] = useState<CharMood>("idle");
  useEffect(() => {
    if (!play) return;
    let on = true;
    let t: ReturnType<typeof setTimeout>;
    const cycle = (m: CharMood) => {
      if (!on) return;
      setMood(m);
      t = setTimeout(() => cycle(m === "idle" ? "cheer" : "idle"), m === "idle" ? 2400 : 1400);
    };
    t = setTimeout(() => cycle("cheer"), 1200);
    return () => {
      on = false;
      clearTimeout(t);
      setMood("idle");
    };
  }, [play]);
  return (
    <RarityFrame rarity={rarity} className={cn("flex items-end justify-center p-2", className)}>
      <CharacterSvg look={look} size={size} mood={play ? mood : "idle"} still={!play} pedestal={false} />
    </RarityFrame>
  );
}
