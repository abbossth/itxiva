"use client";

import { bubbleOf, type PremiumStyle } from "@/lib/premium";
import { NAME_FONT_CLASS } from "@/lib/premium-fonts";
import { cn } from "@/lib/utils";

/** Name in the Premium style: chosen font, gradient color and badge */
export function PremiumName({ name, style, className }: { name: string; style: PremiumStyle | null; className?: string }) {
  if (!style) return <span className={className}>{name}</span>;
  const b = bubbleOf(style.bubble);
  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <span
        className={cn("premium-name bg-clip-text font-bold text-transparent", NAME_FONT_CLASS[style.font])}
        style={{ backgroundImage: `linear-gradient(90deg, ${b.from}, ${b.to}, ${b.from})`, backgroundSize: "200% 100%" }}
      >
        {name}
      </span>
      <span className="premium-badge inline-block text-[1.05em] leading-none" aria-label="Premium" title="IT Xiva Premium">
        {style.badge}
      </span>
    </span>
  );
}
