import { Sparkles } from "lucide-react";
import type { TelegramCommunity } from "@/lib/telegram/community";
import { cn } from "@/lib/utils";

// Ulash tugmasi yonidagi "nechta o'quvchi ulagan" belgisi: oxirgi ulaganlarning bosh harflari, son va ulush

const AVATAR_TONES = [
  "from-sky-400 to-blue-600",
  "from-teal-400 to-emerald-600",
  "from-violet-400 to-indigo-600",
  "from-amber-400 to-orange-600",
];

export function TelegramCommunityBadge({
  community,
  linked,
  className,
}: {
  community: TelegramCommunity;
  /** Ko'rayotgan foydalanuvchi o'zi ulaganmi */
  linked: boolean;
  className?: string;
}) {
  const { linked: count, total, group, recent } = community;

  if (count === 0) {
    return (
      <p
        className={cn(
          "flex w-fit items-center gap-2 rounded-2xl bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-800 ring-1 ring-sky-500/25 dark:text-sky-200",
          className
        )}
      >
        <Sparkles className="h-4 w-4 shrink-0" />
        Birinchi bo&apos;lib ulang!
      </p>
    );
  }

  const others = Math.max(0, count - recent.length);
  const share = group ?? { linked: count, total };
  const percent = share.total > 0 ? Math.min(100, Math.round((share.linked / share.total) * 100)) : 0;

  return (
    <div
      className={cn(
        "flex w-fit max-w-full items-center gap-3 rounded-2xl bg-sky-500/[0.06] py-2 pl-2 pr-4 ring-1 ring-sky-500/20 dark:bg-sky-500/10",
        className
      )}
    >
      <div className="flex shrink-0 -space-x-1.5" aria-hidden>
        {recent.map((initials, i) => (
          <span
            key={i}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br text-[10px] font-bold tracking-tight text-white ring-2 ring-white dark:ring-surface",
              AVATAR_TONES[i % AVATAR_TONES.length]
            )}
          >
            {initials}
          </span>
        ))}
        {others > 0 && (
          <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-bold tabular-nums text-slate-700 ring-2 ring-white dark:bg-slate-800 dark:text-slate-200 dark:ring-surface">
            +{others}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span>
            {linked ? "Siz bilan birga " : ""}
            <span className="font-bold tabular-nums text-sky-700 dark:text-sky-300">{count}</span> ta o&apos;quvchi ulagan
          </span>
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span
            className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={group ? "Guruhingizda ulaganlar ulushi" : "Ulagan o'quvchilar ulushi"}
          >
            <span className="block h-full rounded-full bg-sky-500" style={{ width: `${percent}%` }} />
          </span>
          <span className="tabular-nums">
            {group ? `Guruhingizdan ${share.linked} / ${share.total}` : `${share.total} tadan · ${percent}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
