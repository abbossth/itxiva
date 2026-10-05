"use client";

import { Trophy, Medal, Award } from "lucide-react";
import { LeaderboardEntry } from "@/actions/leaderboard.actions";
import { CoinBadge } from "@/components/ui/coin-badge";

interface PodiumProps {
  top3: LeaderboardEntry[];
}

export function Podium({ top3 }: PodiumProps) {
  // Only display entries that have positive coins
  const validTop = (top3 || []).filter((e) => e.totalCoins > 0);
  if (validTop.length === 0) return null;

  const first = validTop[0];
  const second = validTop.length > 1 ? validTop[1] : null;
  const third = validTop.length > 2 ? validTop[2] : null;

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4 pt-6 pb-2 max-w-md mx-auto">
      {/* 2nd Place (Silver) */}
      {second && (
        <div className="flex flex-col items-center flex-1 order-1">
          <div className="relative mb-2 flex flex-col items-center">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center border-2 border-slate-300 dark:border-slate-500 shadow-md">
              <Medal className="w-6 h-6 sm:w-7 sm:h-7 text-slate-500 dark:text-slate-300" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 mt-1 text-center truncate max-w-[90px]">
              {second.displayName}
            </span>
            <div className="mt-0.5">
              <CoinBadge amount={second.totalCoins} size="sm" animate={false} />
            </div>
          </div>
          <div className="w-full h-24 sm:h-28 rounded-t-2xl bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center font-black text-2xl text-slate-600 dark:text-slate-300 shadow-inner">
            {second.rank}
          </div>
        </div>
      )}

      {/* 1st Place (Gold) */}
      {first && (
        <div className="flex flex-col items-center flex-1 order-2 -mt-4">
          <div className="relative mb-2 flex flex-col items-center">
            <div className="absolute -top-3 w-6 h-6 text-amber-500 animate-bounce">
              <Trophy className="w-6 h-6 fill-amber-400" />
            </div>
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center border-2 border-amber-400 shadow-lg shadow-amber-500/20">
              <Trophy className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500" />
            </div>
            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 mt-1 text-center truncate max-w-[100px]">
              {first.displayName}
            </span>
            <div className="mt-0.5">
              <CoinBadge amount={first.totalCoins} size="sm" animate={false} />
            </div>
          </div>
          <div className="w-full h-32 sm:h-36 rounded-t-2xl bg-gradient-to-t from-amber-500 to-amber-400 text-white flex items-center justify-center font-black text-3xl shadow-lg shadow-amber-500/20">
            {first.rank}
          </div>
        </div>
      )}

      {/* 3rd Place (Bronze) */}
      {third && (
        <div className="flex flex-col items-center flex-1 order-3">
          <div className="relative mb-2 flex flex-col items-center">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center border-2 border-amber-600/50 shadow-md">
              <Award className="w-6 h-6 sm:w-7 sm:h-7 text-amber-700 dark:text-amber-500" />
            </div>
            <span className="text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-200 mt-1 text-center truncate max-w-[90px]">
              {third.displayName}
            </span>
            <div className="mt-0.5">
              <CoinBadge amount={third.totalCoins} size="sm" animate={false} />
            </div>
          </div>
          <div className="w-full h-18 sm:h-20 rounded-t-2xl bg-gradient-to-t from-amber-700/40 to-amber-600/30 dark:from-amber-900/50 dark:to-amber-800/40 flex items-center justify-center font-black text-xl text-amber-800 dark:text-amber-300 shadow-inner">
            {third.rank}
          </div>
        </div>
      )}
    </div>
  );
}
