"use client";

import { premiumSticker } from "@/lib/chat/media-catalog";
import { cn } from "@/lib/utils";

/**
 * Animated premium sticker (Telegram-like): the emoji moves with its own animation and small effects
 * (sparks, hearts, flames…) drawn in CSS. Respects reduced motion (globals.css).
 */
export function AnimatedSticker({ id, size = 96, className }: { id: string; size?: number; className?: string }) {
  const s = premiumSticker(id);
  if (!s) return null;
  return (
    <span role="img" aria-label={s.name} className={cn("asticker relative inline-flex select-none items-center justify-center", `asticker-${s.anim}`, className)} style={{ width: size, height: size, fontSize: size * 0.7 }}>
      <span aria-hidden className="asticker-fx" />
      <span className="asticker-glyph relative leading-none">{s.emoji}</span>
      <span aria-hidden className="asticker-fx2" />
    </span>
  );
}

/** Big animated emoji (a lone emoji sent by a Premium user) */
export function AnimatedEmoji({ text, className }: { text: string; className?: string }) {
  return <span className={cn("asticker-solo inline-block leading-tight", className)}>{text}</span>;
}
