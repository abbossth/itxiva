import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl bg-slate-200/80 dark:bg-slate-800/80 shimmer-effect",
        className
      )}
    />
  );
}

export function LessonCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131E32] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-6 w-3/4 rounded-md" />
      <Skeleton className="h-4 w-1/2 rounded-md" />
      <div className="pt-2 flex items-center gap-2">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function GroupCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131E32] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>
      <div className="pt-2 flex items-center justify-between">
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-9 w-20 rounded-xl" />
      </div>
    </div>
  );
}

export function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Podium Skeleton */}
      <div className="flex items-end justify-center gap-4 py-8">
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-28 w-24 rounded-t-2xl" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-36 w-28 rounded-t-2xl" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-24 w-24 rounded-t-2xl" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131E32] p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-5 w-32 rounded-md" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
