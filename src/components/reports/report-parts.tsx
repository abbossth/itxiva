import * as React from "react";
import { Download, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCORE_GOOD, SCORE_MID, SCORE_TONE, formatPercent, scoreTone, type ScoreTone } from "@/lib/score-tone";

const TILE_TONE: Record<ScoreTone, { card: string; icon: string; value: string }> = {
  good: {
    card: "border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-300",
  },
  mid: {
    card: "border-amber-500/50 bg-amber-50/70 dark:bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-300",
  },
  low: {
    card: "border-rose-500/40 bg-rose-50/70 dark:bg-rose-500/10",
    icon: "text-rose-600 dark:text-rose-400",
    value: "text-rose-700 dark:text-rose-300",
  },
  none: {
    card: "border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface",
    icon: "text-teal-600 dark:text-teal-400",
    value: "text-slate-900 dark:text-slate-100",
  },
};

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "none",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** Ko'rsatkich darajasi: yaxshi — yashil, o'rtacha — sariq, past — qizil */
  tone?: ScoreTone;
}) {
  const t = TILE_TONE[tone];
  return (
    <div className={cn("p-4 rounded-2xl border shadow-xs", t.card)}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
        <Icon className={cn("w-4 h-4 shrink-0", t.icon)} />
        <span className="min-w-0 leading-tight">{label}</span>
        {tone !== "none" && (
          // Tor ekranda yozuv sig'maydi — daraja kartaning rangidan ko'rinadi
          <span className={cn("hidden sm:inline ml-auto shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold", SCORE_TONE[tone].soft)}>
            {SCORE_TONE[tone].label}
          </span>
        )}
      </div>
      <div className={cn("mt-2 text-2xl sm:text-3xl font-black tabular-nums", t.value)}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

export function ReportSection({
  title,
  description,
  onExport,
  children,
  className,
}: {
  title: string;
  description?: string;
  onExport?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
        </div>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 min-h-[36px] rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Bitta foizli ko'rsatkich: darajasiga qarab rangli ustun */
export function ScoreBar({ percent, label }: { percent: number | null; label?: string }) {
  const tone = SCORE_TONE[scoreTone(percent)];
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className={cn("font-black tabular-nums text-base", tone.text)}>{formatPercent(percent)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone.bar)} style={{ width: `${Math.max(0, Math.min(100, percent ?? 0))}%` }} />
      </div>
    </div>
  );
}

/** Ranglar nimani anglatishi: qizil — past, sariq — o'rtacha, yashil — yaxshi */
export function ScoreLegend({ className }: { className?: string }) {
  const items: [ScoreTone, string][] = [
    ["low", `${SCORE_MID}% dan past`],
    ["mid", `${SCORE_MID}–${SCORE_GOOD - 1}%`],
    ["good", `${SCORE_GOOD}% va yuqori`],
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400", className)}>
      {items.map(([tone, text]) => (
        <span key={tone} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full", SCORE_TONE[tone].dot)} />
          <span>
            <span className="font-semibold">{SCORE_TONE[tone].label}</span> — {text}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Bitta o'lchov bo'yicha gorizontal ustunlar ro'yxati (nom — ustun — qiymat) */
export function BarList({
  items,
  max,
  emptyText = "Bu davrda ma'lumot yo'q",
  score = false,
  barClassName = "bg-teal-600 dark:bg-teal-400",
}: {
  items: { key: string; label: React.ReactNode; sub?: string; value: number | null; display: string; barClassName?: string }[];
  max?: number;
  emptyText?: string;
  /** Qiymat foiz (0–100): ustun va raqam darajaga qarab qizil / sariq / yashil bo'ladi */
  score?: boolean;
  barClassName?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">{emptyText}</p>;
  }
  const top = max ?? Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const tone = score ? SCORE_TONE[scoreTone(item.value)] : null;
        return (
          <li key={item.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-semibold text-slate-800 dark:text-slate-200">
                {item.label}
                {item.sub && <span className="ml-1.5 font-normal text-slate-500 dark:text-slate-400">{item.sub}</span>}
              </span>
              <span className={cn("shrink-0 font-bold tabular-nums", tone ? tone.text : "text-slate-900 dark:text-slate-100")}>
                {item.display}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-[width] duration-500", tone ? tone.bar : item.barClassName ?? barClassName)}
                style={{ width: `${item.value === null ? 0 : Math.max(2, Math.min(100, (item.value / top) * 100))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
