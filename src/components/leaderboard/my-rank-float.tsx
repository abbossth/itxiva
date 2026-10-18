"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ro'yxatda o'z qatori ko'rinmay qolganda pastda kichik panel: "Siz · 12-o'rin · 340 XP".
 * Bosilsa — o'z qatoriga olib boradi.
 */
export function MyRankFloat({ rank, value, unit }: { rank: number; value: number; unit: string }) {
  // above — qator ekrandan yuqorida qolgan, below — hali pastda; null — ko'rinib turibdi
  const [where, setWhere] = useState<"above" | "below" | null>(null);

  useEffect(() => {
    const row = document.getElementById("my-rank");
    if (!row) return;
    const observer = new IntersectionObserver(([e]) => {
      setWhere(e.isIntersecting ? null : e.boundingClientRect.top < 0 ? "above" : "below");
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  const Icon = where === "above" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => document.getElementById("my-rank")?.scrollIntoView({ behavior: "smooth", block: "center" })}
      aria-hidden={!where}
      tabIndex={where ? 0 : -1}
      className={cn(
        "fixed left-1/2 bottom-20 md:bottom-5 z-30 -translate-x-1/2 flex items-center gap-2.5 rounded-full bg-slate-900/95 dark:bg-slate-800/95 pl-1.5 pr-4 py-1.5 text-white shadow-xl shadow-slate-900/30 ring-1 ring-white/10 backdrop-blur-md transition-all duration-300 cursor-pointer",
        where ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-4"
      )}
    >
      <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-teal-500 px-2 font-mono text-sm font-black tabular-nums">{rank}</span>
      <span className="text-sm font-bold whitespace-nowrap">
        Siz · <span className="font-mono tabular-nums">{value.toLocaleString("uz-UZ")}</span> {unit}
      </span>
      <Icon className="w-4 h-4 text-white/70" />
    </button>
  );
}
