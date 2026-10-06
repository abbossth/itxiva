import { PageHeaderSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function MentorImportLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withBack />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
