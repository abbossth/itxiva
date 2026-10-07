import { PageHeaderSkeleton, ListSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function AttendanceSessionLoading() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withBack withAction />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <ListSkeleton rows={10} />
    </div>
  );
}
