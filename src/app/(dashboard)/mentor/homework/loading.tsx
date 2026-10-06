import { PageHeaderSkeleton, CardGridSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function MentorHomeworkLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto" aria-busy="true">
      <PageHeaderSkeleton withAction />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-32 rounded-xl shrink-0" />
        ))}
      </div>
      <CardGridSkeleton count={4} className="sm:grid-cols-2" />
    </div>
  );
}
