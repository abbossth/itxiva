"use client";

import { IGroupData } from "@/lib/db/models/group.model";
import { cn } from "@/lib/utils";

interface RankFiltersProps {
  filterType: "all" | "group" | "grade";
  onChangeFilterType: (type: "all" | "group" | "grade") => void;
  selectedGroupId?: string;
  onSelectGroup?: (id: string) => void;
  selectedGrade?: number;
  onSelectGrade?: (grade: number) => void;
  groups: IGroupData[];
  userRole: "mentor" | "student";
}

export function RankFilters({
  filterType,
  onChangeFilterType,
  selectedGroupId,
  onSelectGroup,
  selectedGrade,
  onSelectGrade,
  groups,
}: RankFiltersProps) {
  const grades = [8, 9, 11];

  return (
    <div className="space-y-3">
      {/* Primary Category Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full sm:w-fit overflow-x-auto">
        <button
          type="button"
          onClick={() => onChangeFilterType("all")}
          className={cn(
            "flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] whitespace-nowrap cursor-pointer",
            filterType === "all"
              ? "bg-white dark:bg-surface text-teal-600 dark:text-teal-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          Umumiy (Barcha)
        </button>

        <button
          type="button"
          onClick={() => onChangeFilterType("group")}
          className={cn(
            "flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] whitespace-nowrap cursor-pointer",
            filterType === "group"
              ? "bg-white dark:bg-surface text-teal-600 dark:text-teal-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          Guruh bo&apos;yicha
        </button>

        <button
          type="button"
          onClick={() => onChangeFilterType("grade")}
          className={cn(
            "flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] whitespace-nowrap cursor-pointer",
            filterType === "grade"
              ? "bg-white dark:bg-surface text-teal-600 dark:text-teal-400 shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
          )}
        >
          Sinf bo&apos;yicha
        </button>
      </div>

      {/* Sub-filter for Groups */}
      {filterType === "group" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
          {groups.map((g) => (
            <button
              key={g._id.toString()}
              type="button"
              onClick={() => onSelectGroup?.(g._id.toString())}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 min-h-[36px] cursor-pointer",
                selectedGroupId === g._id.toString()
                  ? "bg-teal-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {g.name} ({g.grade}-sinf)
            </button>
          ))}
        </div>
      )}

      {/* Sub-filter for Grades */}
      {filterType === "grade" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
          {grades.map((gr) => (
            <button
              key={gr}
              type="button"
              onClick={() => onSelectGrade?.(gr)}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-semibold transition-colors shrink-0 min-h-[36px] cursor-pointer",
                selectedGrade === gr
                  ? "bg-teal-600 text-white shadow-xs"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {gr}-sinflar
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
