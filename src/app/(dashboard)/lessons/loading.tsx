import { Skeleton } from "@/components/shared/skeletons";

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

      <Skeleton className="h-44 w-full rounded-3xl" />

      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
