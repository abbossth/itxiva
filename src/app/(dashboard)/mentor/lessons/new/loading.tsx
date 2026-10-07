import { FormSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function NewLessonLoading() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-5 w-56 rounded-md my-3" />
      <FormSkeleton />
      <FormSkeleton fields={2} />
    </div>
  );
}
