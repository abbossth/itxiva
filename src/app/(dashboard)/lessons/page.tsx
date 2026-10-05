import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getLessonsByGroupAndQuarter } from "@/actions/lesson.actions";
import { getGroupById } from "@/actions/group.actions";
import { LessonCard } from "@/components/lessons/lesson-card";
import { EmptyState } from "@/components/shared/empty-state";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Darslarim — ITXiva",
};

interface LessonsPageProps {
  searchParams: Promise<{ quarter?: string }>;
}

export default async function LessonsPage({ searchParams }: LessonsPageProps) {
  const session = await requireAuth();
  if (session.role === "mentor") {
    redirect("/mentor/lessons");
  }

  const resolvedSearchParams = await searchParams;
  const quarter = resolvedSearchParams.quarter ? parseInt(resolvedSearchParams.quarter, 10) : 1;

  if (!session.groupId && session.role === "student") {
    return (
      <EmptyState
        title="Guruh biriktirilmagan"
        description="Siz hali birorta guruhga qo'shilmagansiz. Iltimos, mentorga murojaat qiling."
      />
    );
  }

  const groupId = session.groupId || "";
  const [lessons, group] = await Promise.all([
    groupId ? getLessonsByGroupAndQuarter({ groupId, quarter }) : [],
    groupId ? getGroupById(groupId) : null,
  ]);

  const quarters = [1, 2, 3, 4];

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header with group info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Darslar
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {group ? `${group.name} guruhi (${group.grade}-sinf)` : "Darslar ro'yxati"}
          </p>
        </div>

        {/* Quarter navigation tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit">
          {quarters.map((q) => {
            const isActive = quarter === q;
            return (
              <Link
                key={q}
                href={`/lessons?quarter=${q}`}
                className={cn(
                  "px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all min-h-[40px] flex items-center justify-center select-none",
                  isActive
                    ? "bg-white dark:bg-[#131E32] text-teal-600 dark:text-teal-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                )}
              >
                {q}-chorak
              </Link>
            );
          })}
        </div>
      </div>

      {/* Lessons List */}
      {lessons.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={`${quarter}-chorakda darslar mavjud emas`}
          description="Hozircha mentor tomonidan bu chorak uchun darslar nashr etilmagan."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lessons.map((lesson) => (
            <LessonCard key={lesson._id.toString()} lesson={lesson} isMentor={false} />
          ))}
        </div>
      )}
    </div>
  );
}
