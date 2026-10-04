import { LessonCardSkeleton, Skeleton } from "@/components/shared/skeletons";

export default function LessonsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-md mt-2" />
        </div>
        <Skeleton className="h-10 w-64 rounded-2xl" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LessonCardSkeleton />
        <LessonCardSkeleton />
        <LessonCardSkeleton />
        <LessonCardSkeleton />
      </div>
    </div>
  );
}
