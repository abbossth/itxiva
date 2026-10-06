import { StatTilesSkeleton, ListSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function ProfileLoading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-3xl" />
      <StatTilesSkeleton count={3} className="grid-cols-1 sm:grid-cols-3" />
      <ListSkeleton rows={4} withAvatar={false} />
    </div>
  );
}
