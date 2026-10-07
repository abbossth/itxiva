import { PageHeaderSkeleton, ListSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function ExamLoading() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withBack />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <ListSkeleton rows={6} withAvatar={false} />
    </div>
  );
}
