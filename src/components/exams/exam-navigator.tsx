"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Savol raqamlari: javob berilganlari to'ldirilgan, ekrandagi savol halqa bilan belgilanadi.
 * grid — desktopdagi o'ng panel uchun; strip — telefondagi bir qatorli aylantiriladigan tasma.
 */
export function QuestionNavigator({
  count,
  isAnswered,
  activeIdx,
  onJump,
  variant,
}: {
  count: number;
  isAnswered: (idx: number) => boolean;
  activeIdx: number;
  onJump: (idx: number) => void;
  variant: "grid" | "strip";
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  // Tasmada joriy savol doim ko'rinib tursin
  useEffect(() => {
    if (variant !== "strip") return;
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeIdx, variant]);

  return (
    <div
      ref={stripRef}
      role="navigation"
      aria-label="Savollar"
      className={cn(
        variant === "grid"
          ? "grid grid-cols-5 gap-1.5"
          : "flex gap-1.5 overflow-x-auto -mx-1 px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      )}
    >
      {Array.from({ length: count }, (_, idx) => {
        const answered = isAnswered(idx);
        const active = idx === activeIdx;
        return (
          <button
            key={idx}
            type="button"
            data-idx={idx}
            onClick={() => onJump(idx)}
            aria-current={active ? "step" : undefined}
            aria-label={`${idx + 1}-savol${answered ? ", javob berilgan" : ""}`}
            className={cn(
              "shrink-0 grid place-items-center rounded-xl font-mono text-sm font-bold tabular-nums transition-colors cursor-pointer",
              variant === "grid" ? "h-10" : "h-9 min-w-9 px-1",
              answered
                ? "bg-teal-600 text-white hover:bg-teal-700"
                : "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-teal-500",
              active && "ring-2 ring-teal-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900"
            )}
          >
            {idx + 1}
          </button>
        );
      })}
    </div>
  );
}

export function NavigatorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded bg-teal-600" />
        Javob berilgan
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded border border-slate-300 dark:border-slate-600" />
        Javobsiz
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 rounded ring-2 ring-teal-500" />
        Hozirgi
      </span>
    </div>
  );
}
