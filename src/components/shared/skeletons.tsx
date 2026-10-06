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
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface p-5 space-y-3">
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
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface p-5 space-y-4">
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
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface p-4 space-y-3">
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

// ---- Sahifa darajasidagi skeletonlar: haqiqiy maket o'lchamiga yaqin, shunda kontent kelganda sahifa "sakramaydi" ----

const CARD = "rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface";

export function PageHeaderSkeleton({ withAction = false, withBack = false }: { withAction?: boolean; withBack?: boolean }) {
  return (
    <div className="space-y-3 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
      {withBack && <Skeleton className="h-5 w-40 rounded-md my-3" />}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 rounded-lg" />
          <Skeleton className="h-4 w-72 max-w-full rounded-md" />
        </div>
        {withAction && <Skeleton className="h-11 w-44 rounded-xl" />}
      </div>
    </div>
  );
}

export function StatTilesSkeleton({ count = 6, className = "grid-cols-2 lg:grid-cols-3" }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(CARD, "p-4 space-y-3")}>
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  className = "sm:grid-cols-2 lg:grid-cols-3",
  withImage = false,
}: {
  count?: number;
  className?: string;
  withImage?: boolean;
}) {
  return (
    <div className={cn("grid gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(CARD, "p-4 space-y-3")}>
          {withImage && <Skeleton className="aspect-[4/3] w-full rounded-2xl" />}
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-5 w-3/4 rounded-md" />
          <Skeleton className="h-4 w-1/2 rounded-md" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 8, withAvatar = true }: { rows?: number; withAvatar?: boolean }) {
  return (
    <div className={cn(CARD, "divide-y divide-slate-100 dark:divide-slate-800")}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-3 sm:p-4 flex items-center gap-3">
          {withAvatar && <Skeleton className="h-9 w-9 rounded-full shrink-0" />}
          <div className="flex-1 space-y-1.5 min-w-0">
            <Skeleton className="h-4 w-2/5 rounded-md" />
            <Skeleton className="h-3 w-1/4 rounded-md" />
          </div>
          <Skeleton className="h-9 w-24 sm:w-40 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className={cn(CARD, "rounded-3xl p-6 space-y-5 max-w-4xl mx-auto")}>
      <Skeleton className="h-6 w-56 rounded-md" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-32 rounded-md" />
          <Skeleton className={cn("w-full rounded-xl", i === fields - 1 ? "h-32" : "h-11")} />
        </div>
      ))}
    </div>
  );
}

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className={cn(CARD, "p-4 sm:p-5 space-y-4")}>
      <Skeleton className="h-5 w-48 rounded-md" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex justify-between">
            <Skeleton className="h-3.5 w-1/3 rounded-md" />
            <Skeleton className="h-3.5 w-10 rounded-md" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}
