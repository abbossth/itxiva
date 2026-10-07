import { PageHeaderSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function MyHomeworkLoading() {
  return (
    <div className="space-y-4 max-w-3xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton />
      <Skeleton className="h-5 w-40 rounded-lg" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
