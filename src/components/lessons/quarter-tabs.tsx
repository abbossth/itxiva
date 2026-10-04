"use client";

import { cn } from "@/lib/utils";

interface QuarterTabsProps {
  selectedQuarter: number;
  onSelectQuarter: (q: number) => void;
  className?: string;
}

export function QuarterTabs({
  selectedQuarter,
  onSelectQuarter,
  className,
}: QuarterTabsProps) {
  const quarters = [1, 2, 3, 4];

  return (
    <div className={cn("flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit", className)}>
      {quarters.map((q) => {
        const isActive = selectedQuarter === q;
        return (
          <button
            key={q}
            type="button"
            onClick={() => onSelectQuarter(q)}
            className={cn(
              "px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] select-none cursor-pointer",
              isActive
                ? "bg-white dark:bg-[#131E32] text-teal-600 dark:text-teal-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            )}
          >
            {q}-chorak
          </button>
        );
      })}
    </div>
  );
}
