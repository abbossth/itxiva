import { PageHeaderSkeleton, CardGridSkeleton } from "@/components/shared/skeletons";

export default function MyOrdersLoading() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withBack />
      <CardGridSkeleton count={3} className="grid-cols-1" />
    </div>
  );
}
