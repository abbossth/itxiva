import { FormSkeleton, PageHeaderSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function QuestDetailLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <PageHeaderSkeleton withBack />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <FormSkeleton fields={6} />
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
