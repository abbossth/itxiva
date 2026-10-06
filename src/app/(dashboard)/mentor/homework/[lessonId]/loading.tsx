import { PageHeaderSkeleton, ListSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function MentorHomeworkDetailLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withBack />
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-11 w-32 rounded-xl shrink-0" />
        ))}
      </div>
      <ListSkeleton rows={8} />
    </div>
  );
}
