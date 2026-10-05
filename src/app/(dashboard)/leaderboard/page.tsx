import { requireAuth } from "@/lib/auth/guards";
import { getLeaderboardAction } from "@/actions/leaderboard.actions";
import { getGroups } from "@/actions/group.actions";
import { Podium } from "@/components/leaderboard/podium";
import { RankTable } from "@/components/leaderboard/rank-table";
import { Trophy } from "lucide-react";
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
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full sm:w-fit overflow-x-auto">
          <Link
            href="/leaderboard?type=all"
            className={cn(
              "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] flex items-center justify-center whitespace-nowrap",
              type === "all"
                ? "bg-white dark:bg-[#131E32] text-teal-600 dark:text-teal-400 shadow-xs"
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
              "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] flex items-center justify-center whitespace-nowrap",
              type === "group"
                ? "bg-white dark:bg-[#131E32] text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            Guruh bo&apos;yicha
          </Link>

          <Link
            href="/leaderboard?type=grade&grade=8"
            className={cn(
              "flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] flex items-center justify-center whitespace-nowrap",
              type === "grade"
                ? "bg-white dark:bg-[#131E32] text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            Sinf bo&apos;yicha
          </Link>
        </div>

        {/* Sub-tabs for Groups */}
        {type === "group" && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
            {groups.map((g) => {
              const isSelected = groupId === g._id.toString();
              return (
                <Link
                  key={g._id.toString()}
                  href={`/leaderboard?type=group&groupId=${g._id.toString()}`}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 min-h-[36px] flex items-center justify-center",
                    isSelected
                      ? "bg-teal-600 text-white shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
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
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
            {grades.map((gr) => {
              const isSelected = grade === gr;
              return (
                <Link
                  key={gr}
                  href={`/leaderboard?type=grade&grade=${gr}`}
                  className={cn(
                    "px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 min-h-[36px] flex items-center justify-center",
                    isSelected
                      ? "bg-teal-600 text-white shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  {gr}-sinflar
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Top 3 Podium (shown if at least 1 student has entries) */}
      {leaderboardData.top3.length > 0 && (
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] p-4 sm:p-6 shadow-xs">
          <Podium top3={leaderboardData.top3} />
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
