import { PageHeaderSkeleton, StatTilesSkeleton, SectionSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function MentorReportsLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton />
      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between">
        <Skeleton className="h-12 w-full sm:w-96 rounded-2xl" />
        <Skeleton className="h-11 w-full sm:w-56 rounded-xl" />
      </div>
      <StatTilesSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
      <SectionSkeleton rows={2} />
    </div>
  );
}
