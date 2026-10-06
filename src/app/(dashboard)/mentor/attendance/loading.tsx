import { PageHeaderSkeleton, CardGridSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function MentorAttendanceLoading() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withAction />
      <Skeleton className="h-12 w-52 rounded-2xl" />
      <Skeleton className="h-4 w-40 rounded-md" />
      <CardGridSkeleton count={3} />
      <Skeleton className="h-4 w-56 rounded-md" />
      <CardGridSkeleton count={6} />
    </div>
  );
}
