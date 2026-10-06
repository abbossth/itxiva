"use client";

import { LeaderboardEntry } from "@/actions/leaderboard.actions";
import { Badge } from "@/components/ui/badge";
import { CoinBadge } from "@/components/ui/coin-badge";
import { cn } from "@/lib/utils";

interface RankTableProps {
  entries: LeaderboardEntry[];
  currentUserEntry?: LeaderboardEntry | null;
}

export function RankTable({ entries, currentUserEntry }: RankTableProps) {
  if (entries.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Bu toifada hali o&apos;quvchilar yo&apos;q
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pinned Current User Card if student is outside top 5 */}
      {currentUserEntry && currentUserEntry.rank > 5 && (
        <div className="p-3.5 rounded-2xl bg-teal-500/10 border-2 border-teal-500/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-teal-500 text-white flex items-center justify-center font-bold text-sm">
              #{currentUserEntry.rank}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-teal-900 dark:text-teal-200">
                  {currentUserEntry.displayName}
                </span>
                <Badge variant="default" className="text-[10px] py-0">
                  Sizning o&apos;rningiz
                </Badge>
              </div>
              <span className="text-xs text-teal-700 dark:text-teal-300">
                Guruh: {currentUserEntry.groupName}
              </span>
            </div>
          </div>
          <div className="shrink-0">
            <CoinBadge amount={currentUserEntry.totalCoins} size="sm" animate={false} />
          </div>
        </div>
      )}

      {/* Main Ranking Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface">
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {entries.map((entry) => {
            const rankStyles = {
              1: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-black",
              2: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 font-bold",
              3: "bg-amber-50 text-amber-900 dark:bg-amber-900/40 dark:text-amber-400 font-bold",
            }[entry.rank] || "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium";

            return (
              <div
                key={entry.userId}
                className={cn(
                  "flex items-center justify-between p-3.5 sm:p-4 transition-colors",
                  entry.isCurrentUser
                    ? "bg-teal-500/10 dark:bg-teal-950/30 font-semibold"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                )}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 pr-2">
                  <span
                    className={cn(
                      "w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-xs sm:text-sm shrink-0",
                      rankStyles
                    )}
                  >
                    {entry.rank}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {entry.displayName}
                      </span>
                      {entry.isCurrentUser && (
                        <Badge variant="default" className="text-[10px] py-0 px-1.5 shrink-0">
                          Siz
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <span>{entry.groupName}</span>
                      {entry.fullName && entry.fullName !== entry.displayName && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          ({entry.fullName})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  <CoinBadge amount={entry.totalCoins} size="sm" animate={false} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
