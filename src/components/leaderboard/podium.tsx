import { Crown } from "lucide-react";
import { LeaderboardEntry } from "@/actions/leaderboard.actions";
import { CountUp } from "@/components/leaderboard/count-up";
import { cn } from "@/lib/utils";

interface PodiumProps {
  top3: LeaderboardEntry[];
}

const PLACES = {
  1: {
    order: "order-2",
    height: "h-32 sm:h-40",
    block: "bg-gradient-to-t from-amber-600 to-amber-400 text-white shadow-lg shadow-amber-500/30",
    ring: "ring-4 ring-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    avatar: "w-16 h-16 sm:w-20 sm:h-20 text-xl sm:text-2xl",
    delay: "320ms",
    label: "text-sm sm:text-base",
  },
  2: {
    order: "order-1",
    height: "h-24 sm:h-28",
    block: "bg-gradient-to-t from-slate-400 to-slate-300 text-slate-900 dark:from-slate-600 dark:to-slate-500 dark:text-white",
    ring: "ring-4 ring-slate-300 dark:ring-slate-500 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
    avatar: "w-12 h-12 sm:w-16 sm:h-16 text-base sm:text-xl",
    delay: "160ms",
    label: "text-xs sm:text-sm",
  },
  3: {
    order: "order-3",
    height: "h-16 sm:h-20",
    block: "bg-gradient-to-t from-orange-700 to-orange-500 text-white",
    ring: "ring-4 ring-orange-500/70 bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
    avatar: "w-12 h-12 sm:w-16 sm:h-16 text-base sm:text-xl",
    delay: "0ms",
    label: "text-xs sm:text-sm",
  },
} as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)).toUpperCase();
}

/** Kuchli uchlik: shohsupa pastdan ko'tariladi, birinchi o'rinda toj */
export function Podium({ top3 }: PodiumProps) {
  const valid = (top3 || []).filter((e) => e.totalCoins > 0).slice(0, 3);
  if (valid.length === 0) return null;

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 max-w-lg mx-auto pt-8">
      {valid.map((entry, i) => {
        const place = PLACES[(i + 1) as 1 | 2 | 3];
        return (
          <div key={entry.userId} className={cn("flex min-w-0 flex-1 flex-col items-center", place.order)}>
            <div className="podium-person flex flex-col items-center min-w-0 w-full pb-2" style={{ animationDelay: `calc(${place.delay} + 350ms)` }}>
              <div className="relative">
                {i === 0 && (
                  <Crown aria-hidden className="crown-float absolute -top-7 left-1/2 w-8 h-8 text-amber-500 fill-amber-400 drop-shadow" />
                )}
                <div className={cn("flex items-center justify-center rounded-full font-mono font-black", place.avatar, place.ring)}>
                  {initials(entry.displayName)}
                </div>
              </div>
              <span
                className={cn(
                  "mt-2 max-w-full truncate px-1 text-center font-bold text-slate-900 dark:text-slate-100",
                  place.label,
                  entry.isCurrentUser && "text-teal-700 dark:text-teal-300"
                )}
              >
                {entry.displayName}
                {entry.isCurrentUser && " (siz)"}
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400">{entry.groupName}</span>
              <span className="mt-0.5 font-mono text-sm sm:text-base font-black tabular-nums text-amber-700 dark:text-amber-400">
                <CountUp value={entry.totalCoins} /> <span className="text-[10px] font-bold">coin</span>
              </span>
            </div>
            <div
              className={cn("podium-rise relative w-full overflow-hidden rounded-t-2xl flex items-start justify-center pt-2 font-mono text-3xl sm:text-4xl font-black", place.height, place.block)}
              style={{ animationDelay: place.delay }}
            >
              {i === 0 && <span aria-hidden className="podium-shine absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent" />}
              <span className="relative">{entry.rank}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
