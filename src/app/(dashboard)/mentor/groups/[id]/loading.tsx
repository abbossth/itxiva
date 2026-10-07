import { ListSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function GroupDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <Skeleton className="h-11 w-full max-w-md rounded-xl" />
      <ListSkeleton rows={10} />
    </div>
  );
}
