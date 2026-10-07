import { PageHeaderSkeleton, StatTilesSkeleton, ListSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function AttendanceLoading() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton />
      <Skeleton className="h-72 w-full rounded-3xl" />
      <StatTilesSkeleton count={3} className="grid-cols-3" />
      <ListSkeleton rows={5} withAvatar={false} />
    </div>
  );
}
