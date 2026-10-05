import { requireAuth } from "@/lib/auth/guards";
import { getLeaderboardAction } from "@/actions/leaderboard.actions";
import { getGroups } from "@/actions/group.actions";
import { Podium } from "@/components/leaderboard/podium";
import { RankTable } from "@/components/leaderboard/rank-table";
import { Trophy, Sparkles } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Reyting — ITXiva",
};

interface LeaderboardPageProps {
  searchParams: Promise<{
    type?: "all" | "group" | "grade";
    groupId?: string;
    grade?: string;
  }>;
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  await requireAuth();
  const resolvedSearchParams = await searchParams;

  const type = resolvedSearchParams.type || "all";
  const groupId = resolvedSearchParams.groupId;
  const grade = resolvedSearchParams.grade ? parseInt(resolvedSearchParams.grade, 10) : undefined;

  const [leaderboardData, groups] = await Promise.all([
    getLeaderboardAction({ type, groupId, grade }),
    getGroups(),
  ]);

  const grades = [8, 9, 11];
  const hasAnyCoins = leaderboardData.top3.some((e) => e.totalCoins > 0);

  return (
    <div className="space-y-6 animate-in fade-in max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Trophy className="w-7 h-7 text-amber-500" />
            O&apos;quvchilar Reytingi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Coin ballari asosida hisoblangan peshqadamlar jadvali ({leaderboardData.totalParticipants} o&apos;quvchi)
          </p>
        </div>
      </div>

      {/* Filter Navigation */}
      <div className="space-y-3">
        {/* Primary Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full sm:w-fit overflow-x-auto scrollbar-none snap-x snap-mandatory">
          <Link
            href="/leaderboard?type=all"
            className={cn(
              "flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[44px] flex items-center justify-center whitespace-nowrap snap-start",
              type === "all"
                ? "bg-white dark:bg-[#131E32] text-teal-700 dark:text-teal-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            Umumiy (Barcha)
          </Link>

          <Link
            href={
              groups.length > 0
                ? `/leaderboard?type=group&groupId=${groups[0]._id.toString()}`
                : "/leaderboard?type=group"
            }
            className={cn(
              "flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[44px] flex items-center justify-center whitespace-nowrap snap-start",
              type === "group"
                ? "bg-white dark:bg-[#131E32] text-teal-700 dark:text-teal-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            Guruh bo&apos;yicha
          </Link>

          <Link
            href="/leaderboard?type=grade&grade=8"
            className={cn(
              "flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[44px] flex items-center justify-center whitespace-nowrap snap-start",
              type === "grade"
                ? "bg-white dark:bg-[#131E32] text-teal-700 dark:text-teal-300 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            Sinf bo&apos;yicha
          </Link>
        </div>

        {/* Sub-tabs for Groups */}
        {type === "group" && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none snap-x snap-mandatory">
            {groups.map((g) => {
              const isSelected = groupId === g._id.toString();
              return (
                <Link
                  key={g._id.toString()}
                  href={`/leaderboard?type=group&groupId=${g._id.toString()}`}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 min-h-[40px] flex items-center justify-center snap-start",
                    isSelected
                      ? "bg-teal-600 text-white shadow-xs"
                      : "bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  {g.name} ({g.grade}-sinf)
                </Link>
              );
            })}
          </div>
        )}

        {/* Sub-tabs for Grades */}
        {type === "grade" && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-none snap-x snap-mandatory">
            {grades.map((gr) => {
              const isSelected = grade === gr;
              return (
                <Link
                  key={gr}
                  href={`/leaderboard?type=grade&grade=${gr}`}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 min-h-[40px] flex items-center justify-center snap-start",
                    isSelected
                      ? "bg-teal-600 text-white shadow-xs"
                      : "bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  {gr}-sinflar
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Top 3 Podium or Empty Inspiration Banner (fixes K3) */}
      {hasAnyCoins ? (
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] p-4 sm:p-6 shadow-xs">
          <Podium top3={leaderboardData.top3} />
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-amber-300/80 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/20 p-6 sm:p-8 text-center space-y-2.5 max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Hali hech kim coin to&apos;plamagan — birinchi bo&apos;ling!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Darslarda qatnashing, davomatdan o&apos;ting va testlarni yechib birinchi o&apos;ringa ko&apos;tariling.
          </p>
        </div>
      )}

      {/* Leaderboard Table with Current User Indicator */}
      <RankTable
        entries={leaderboardData.entries}
        currentUserEntry={leaderboardData.currentUserEntry}
      />
    </div>
  );
}
