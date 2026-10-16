import { ListSkeleton, PageHeaderSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function QuestReviewLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <ListSkeleton rows={6} />
        <Skeleton className="h-[32rem] rounded-2xl" />
      </div>
    </div>
  );
}
