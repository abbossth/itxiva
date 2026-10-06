import { PageHeaderSkeleton, ListSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function GroupDetailLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withBack withAction />
      <Skeleton className="h-11 w-full max-w-md rounded-xl" />
      <ListSkeleton rows={10} />
    </div>
  );
}
