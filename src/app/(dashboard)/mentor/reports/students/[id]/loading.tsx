import { PageHeaderSkeleton, StatTilesSkeleton, SectionSkeleton } from "@/components/shared/skeletons";

export default function StudentReportLoading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withBack />
      <StatTilesSkeleton count={4} className="grid-cols-2 lg:grid-cols-4" />
      <SectionSkeleton rows={2} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
    </div>
  );
}
