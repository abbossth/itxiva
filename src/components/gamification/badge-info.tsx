"use client";

import { useState } from "react";
import { Check, ChevronDown, Coins, Lightbulb } from "lucide-react";
import { BadgeMedal } from "@/components/gamification/badge-medal";
import { BADGE_BY_ID, TIER_LABEL, type BadgeId, type BadgeTier } from "@/lib/gamification/badges";
import { cn } from "@/lib/utils";

const TIER_CHIP: Record<BadgeTier, string> = {
  bronze: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  silver: "bg-slate-400/20 text-slate-700 dark:text-slate-200",
  gold: "bg-amber-400/20 text-amber-700 dark:text-amber-300",
};
const TIER_BAR: Record<BadgeTier, string> = {
  bronze: "from-orange-400 to-orange-600",
  silver: "from-slate-300 to-slate-500",
  gold: "from-yellow-300 to-amber-500",
};

/**
 * Nishon kartasi: medal, nomi, nima uchun berilishi va keyingi bosqichgacha progress doim ko'rinib turadi.
 * Bosilsa — o'sha joyda ochilib, qanday olinishi va bosqichlari (nechta kerak, coin) chiqadi.
 */
export function BadgeInfo({ id, tier, value }: { id: BadgeId; tier: BadgeTier | null; value: number }) {
  const def = BADGE_BY_ID[id];
  const [open, setOpen] = useState(false);
  if (!def) return null;

  const nextIndex = def.tiers.findIndex((t) => value < t.threshold);
  const next = nextIndex >= 0 ? def.tiers[nextIndex] : null;
  const from = nextIndex > 0 ? def.tiers[nextIndex - 1].threshold : 0;
  const percent = next ? Math.max(3, Math.round(((value - from) / (next.threshold - from)) * 100)) : 100;

  return (
    <div
      className={cn(
        "rounded-2xl border transition-colors",
        open ? "border-teal-500/40 bg-teal-500/[0.04]" : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left cursor-pointer rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <BadgeMedal id={id} tier={tier} size="md" className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-black text-slate-900 dark:text-slate-100">{def.title}</span>
            {tier ? (
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", TIER_CHIP[tier])}>{TIER_LABEL[tier]}</span>
            ) : (
              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">Olinmagan</span>
            )}
          </span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{def.description}</span>
          {next ? (
            <span className="mt-1.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span className={cn("block h-full rounded-full bg-gradient-to-r", TIER_BAR[next.tier])} style={{ width: `${percent}%` }} />
              </span>
              <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                {value}/{next.threshold}
              </span>
            </span>
          ) : (
            <span className="mt-1 block text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Eng yuqori bosqich olingan!</span>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3 animate-in fade-in">
          <p className="flex gap-2 rounded-xl bg-teal-500/10 p-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
            <span>
              <b className="text-teal-700 dark:text-teal-300">Qanday olinadi: </b>
              {def.howTo}
            </span>
          </p>
          <ul className="grid grid-cols-3 gap-1.5">
            {def.tiers.map((t) => {
              const done = value >= t.threshold;
              return (
                <li
                  key={t.tier}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-xl border px-1.5 pb-2 pt-2.5 text-center",
                    done ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-200 dark:border-slate-800"
                  )}
                >
                  {done && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="olingan" />}
                  <BadgeMedal id={id} tier={t.tier} size="sm" />
                  <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{TIER_LABEL[t.tier]}</span>
                  <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                    {t.threshold} {def.unit}
                  </span>
                  <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-bold text-amber-700 dark:text-amber-400">
                    <Coins className="h-3 w-3" />+{t.coins}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
