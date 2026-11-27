"use client";

import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isSfxMuted, setSfxMuted, subscribeSfx } from "@/lib/game/sfx";
import { unlockSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

export function useSfxMuted(): boolean {
  return useSyncExternalStore(subscribeSfx, isSfxMuted, () => false);
}

/** Global game-sound mute button (saved on this device) */
export function SfxToggle({ className }: { className?: string }) {
  const muted = useSfxMuted();
  return (
    <button
      type="button"
      onClick={() => {
        unlockSound();
        setSfxMuted(!muted);
      }}
      aria-pressed={muted}
      aria-label={muted ? "Ovozni yoqish" : "Ovozni o'chirish"}
      title={muted ? "Ovozni yoqish" : "Ovozni o'chirish"}
      className={cn(
        "game-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--g-panel) text-white ring-1 ring-white/10",
        muted && "text-(--g-muted)",
        className
      )}
    >
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}
