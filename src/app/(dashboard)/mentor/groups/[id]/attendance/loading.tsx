import { Skeleton } from "@/components/shared/skeletons";

export default function GroupAttendanceLoading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-44 rounded-xl" />
        <Skeleton className="h-11 w-36 rounded-xl" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-xl" />
      ))}
    </div>
  );
}
