"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Coins, Lightbulb } from "lucide-react";
import { BadgeMedal } from "@/components/gamification/badge-medal";
import { BADGE_BY_ID, TIER_LABEL, type BadgeId, type BadgeTier } from "@/lib/gamification/badges";
import { cn } from "@/lib/utils";

const TIER_DOT: Record<BadgeTier, string> = {
  bronze: "bg-orange-600",
  silver: "bg-slate-400",
  gold: "bg-amber-400",
};

/**
 * Nishon (medal, nomi, unvoni) — ustiga sichqoncha olib borilsa yoki bosilsa tushuntirish oynasi chiqadi:
 * nishon nima uchun, qanday olinadi, bosqichlari (unvon, nechta kerak, coin) va hozirgi holat.
 */
export function BadgeInfo({ id, tier, value }: { id: BadgeId; tier: BadgeTier | null; value: number }) {
  const def = BADGE_BY_ID[id];
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<"center" | "left" | "right">("center");
  const ref = useRef<HTMLDivElement>(null);
  const popId = useId();

  // Ochiq bo'lsa: tashqariga bosilsa yoki Escape — yopiladi
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!def) return null;

  const show = () => {
    // Oyna ekrandan chiqib ketmasligi uchun chetdagi nishonlarda chapga/o'ngga tekislanadi
    const r = ref.current?.getBoundingClientRect();
    if (r) setAlign(r.left < 150 ? "left" : window.innerWidth - r.right < 150 ? "right" : "center");
    setOpen(true);
  };

  const next = def.tiers.find((t) => value < t.threshold) ?? null;
  const prevThreshold = next ? def.tiers[def.tiers.indexOf(next) - 1]?.threshold ?? 0 : 0;
  const percent = next ? Math.round(((value - prevThreshold) / (next.threshold - prevThreshold)) * 100) : 100;

  return (
    <div ref={ref} className="relative" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        onFocus={show}
        onBlur={(e) => !ref.current?.contains(e.relatedTarget as Node) && setOpen(false)}
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl p-1 text-center cursor-help focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <BadgeMedal id={id} tier={tier} size="md" className="mb-1" />
        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{def.title}</span>
        <span className={cn("text-[11px] font-semibold", tier ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400")}>
          {tier ? def.tierNames[tier] : next ? `"${def.tierNames[next.tier]}"gacha ${value}/${next.threshold}` : ""}
        </span>
      </button>

      {open && (
        <div
          id={popId}
          role="tooltip"
          className={cn(
            "absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-left shadow-xl shadow-slate-900/15 animate-in fade-in",
            align === "center" && "left-1/2 -translate-x-1/2",
            align === "left" && "left-0",
            align === "right" && "right-0"
          )}
        >
          <div className="flex items-center gap-3">
            <BadgeMedal id={id} tier={tier} size="sm" className="shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 dark:text-slate-100">{def.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
            </div>
          </div>

          <p className="mt-3 flex gap-2 rounded-xl bg-teal-500/10 p-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
            <span>
              <b className="text-teal-700 dark:text-teal-300">Qanday olinadi: </b>
              {def.howTo}
            </span>
          </p>

          <ul className="mt-3 space-y-1.5">
            {def.tiers.map((t) => {
              const done = value >= t.threshold;
              return (
                <li key={t.tier} className="flex items-center gap-2 text-xs">
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", TIER_DOT[t.tier])} />
                  <span className={cn("min-w-0 flex-1", done ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-400")}>
                    <b>{def.tierNames[t.tier]}</b> <span className="opacity-75">({TIER_LABEL[t.tier].toLowerCase()})</span> — {t.threshold} {def.unit}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 font-mono font-bold text-amber-700 dark:text-amber-400">
                    <Coins className="h-3 w-3" />+{t.coins}
                  </span>
                  {done && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="olingan" />}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            {next ? (
              <>
                <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <span>
                    &quot;{def.tierNames[next.tier]}&quot; unvonigacha {next.threshold - value} qoldi
                  </span>
                  <span className="font-mono">
                    {value}/{next.threshold}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(3, percent)}%` }} />
                </div>
              </>
            ) : (
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Barcha bosqichlar olingan — siz eng yuqori unvondasiz!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
