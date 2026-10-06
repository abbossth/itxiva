import { Skeleton } from "@/components/shared/skeletons";

export default function LessonDetailLoading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-6 w-36 rounded-md" />

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface p-6 space-y-6">
        <div className="space-y-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <Skeleton className="h-5 w-28 rounded-md" />
          <Skeleton className="h-9 w-3/4 rounded-lg" />
          <Skeleton className="h-5 w-1/2 rounded-md" />
        </div>

        <Skeleton className="aspect-video w-full rounded-2xl" />

        <div className="space-y-2">
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
