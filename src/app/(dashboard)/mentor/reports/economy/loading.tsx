import { PageHeaderSkeleton, Skeleton, StatTilesSkeleton } from "@/components/shared/skeletons";

export default function EconomyLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <PageHeaderSkeleton withAction />
      <StatTilesSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
