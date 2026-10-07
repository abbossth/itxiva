import { TrendingUp } from "lucide-react";
import { LeaderboardEntry } from "@/actions/leaderboard.actions";
import { RankDelta } from "@/components/leaderboard/rank-delta";
import { cn } from "@/lib/utils";

interface RankTableProps {
  entries: LeaderboardEntry[];
}

const MEDAL: Record<number, string> = {
  1: "bg-amber-400 text-amber-950",
  2: "bg-slate-300 text-slate-900 dark:bg-slate-500 dark:text-white",
  3: "bg-orange-500 text-white",
};

/** To'liq ro'yxat: har bir qatorda liderga nisbatan o'sish chizig'i va shu haftadagi o'sish */
export function RankTable({ entries }: RankTableProps) {
  if (entries.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-slate-600 dark:text-slate-400">Bu toifada hali o&apos;quvchilar yo&apos;q</div>
    );
  }
  const leaderCoins = Math.max(1, entries[0]?.totalCoins ?? 0);

  return (
    <ol className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800/60">
      {entries.map((entry, index) => {
        const percent = entry.totalCoins > 0 ? Math.max(3, Math.round((entry.totalCoins / leaderCoins) * 100)) : 0;
        return (
          <li
            key={entry.userId}
            id={entry.isCurrentUser ? "my-rank" : undefined}
            className={cn(
              "rank-row relative flex items-center gap-3 px-3 sm:px-4 py-2.5 scroll-mt-24",
              entry.isCurrentUser ? "bg-teal-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
            )}
            // Faqat birinchi ekrandagi qatorlar navbat bilan chiqadi — uzun ro'yxat kutib qolmaydi
            style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
          >
            {entry.isCurrentUser && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-teal-500" />}
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-black tabular-nums",
                (entry.totalCoins > 0 && MEDAL[entry.rank]) || "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              )}
            >
              {entry.rank}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("truncate text-sm sm:text-base font-semibold", entry.isCurrentUser ? "text-teal-800 dark:text-teal-200 font-bold" : "text-slate-900 dark:text-slate-100")}>
                  {entry.displayName}
                </span>
                {entry.isCurrentUser && (
                  <span className="shrink-0 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Siz</span>
                )}
                {entry.isCurrentUser && <RankDelta rank={entry.rank} />}
                <span className="shrink-0 text-xs text-slate-600 dark:text-slate-400">{entry.groupName}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={cn(
                    "bar-grow h-full rounded-full",
                    entry.rank === 1 ? "bg-amber-500" : entry.isCurrentUser ? "bg-teal-500" : "bg-teal-500/50"
                  )}
                  style={{ width: `${percent}%`, animationDelay: `${Math.min(index, 12) * 35 + 200}ms` }}
                />
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="font-mono text-sm sm:text-base font-black tabular-nums text-slate-900 dark:text-slate-100">
                {entry.totalCoins.toLocaleString("uz-UZ")}
              </div>
              {entry.weekCoins > 0 ? (
                <div className="inline-flex items-center gap-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400" title="Oxirgi 7 kunda">
                  <TrendingUp className="w-3 h-3" />+{entry.weekCoins}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">coin</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
