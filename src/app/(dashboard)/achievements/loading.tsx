import { PageHeaderSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function AchievementsLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <PageHeaderSkeleton />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
