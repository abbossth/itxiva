import { PageHeaderSkeleton, CardGridSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function ShopLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withAction />
      <Skeleton className="h-14 w-full rounded-2xl" />
      <CardGridSkeleton count={6} className="grid-cols-2 lg:grid-cols-3" withImage />
    </div>
  );
}
