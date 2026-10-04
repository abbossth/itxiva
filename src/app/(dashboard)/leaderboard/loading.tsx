import { LeaderboardSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function LeaderboardLoading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-md mt-2" />
      </div>

      <Skeleton className="h-11 w-80 rounded-2xl" />

      <LeaderboardSkeleton />
    </div>
  );
}
