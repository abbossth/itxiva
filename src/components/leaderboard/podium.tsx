"use client";

import { Trophy, Medal, Award, Coins } from "lucide-react";
import { LeaderboardEntry } from "@/actions/leaderboard.actions";

interface PodiumProps {
  top3: LeaderboardEntry[];
}

export function Podium({ top3 }: PodiumProps) {
  if (!top3 || top3.length === 0) return null;

  const first = top3[0];
  const second = top3.length > 1 ? top3[1] : null;
  const third = top3.length > 2 ? top3[2] : null;

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
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-amber-500">
              <Coins className="w-3 h-3" />
              {second.totalCoins}
            </div>
          </div>
          <div className="w-full h-24 sm:h-28 rounded-t-2xl bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center font-black text-2xl text-slate-600 dark:text-slate-300 shadow-inner">
            2
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
            <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
              <Coins className="w-3.5 h-3.5 fill-amber-500" />
              {first.totalCoins}
            </div>
          </div>
          <div className="w-full h-32 sm:h-36 rounded-t-2xl bg-gradient-to-t from-amber-500 to-amber-400 text-white flex items-center justify-center font-black text-3xl shadow-lg shadow-amber-500/20">
            1
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
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-amber-500">
              <Coins className="w-3 h-3" />
              {third.totalCoins}
            </div>
          </div>
          <div className="w-full h-18 sm:h-20 rounded-t-2xl bg-gradient-to-t from-amber-700/40 to-amber-600/30 dark:from-amber-900/50 dark:to-amber-800/40 flex items-center justify-center font-black text-xl text-amber-800 dark:text-amber-300 shadow-inner">
            3
          </div>
        </div>
      )}
    </div>
  );
}
