import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { getLessonsByGroupAndQuarter } from "@/actions/lesson.actions";
import { getHomeworkJournal, getHomeworkOverviewForMentor, getHomeworkStatsForLessons } from "@/actions/homework.actions";
import { LessonsManager } from "@/components/mentor/lessons-manager";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata = {
  title: "Darslar — ITXiva",
};

interface MentorLessonsPageProps {
  searchParams: Promise<{
    groupId?: string;
    quarter?: string;
    view?: string;
  }>;
}

export default async function MentorLessonsPage({ searchParams }: MentorLessonsPageProps) {
  await requireMentorPage();
  const resolvedSearchParams = await searchParams;

  const groups = await getGroups();

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Guruhlar mavjud emas"
        description="Dars yaratishdan oldin kamida bitta guruh yarating."
        action={
          <Link href="/mentor/groups">
            <Button variant="primary" className="gap-2">
              <Plus className="w-4 h-4" />
              Guruh yaratish
            </Button>
          </Link>
        }
      />
    );
  }

  const requested = resolvedSearchParams.groupId;
  const selectedGroupId = groups.some((g) => g._id.toString() === requested) ? requested! : groups[0]._id.toString();
  const parsedQuarter = parseInt(resolvedSearchParams.quarter ?? "1", 10);
  const selectedQuarter = parsedQuarter >= 1 && parsedQuarter <= 4 ? parsedQuarter : 1;
  const view = resolvedSearchParams.view === "journal" ? "journal" : "list";

  const [lessons, overview, journal] = await Promise.all([
    getLessonsByGroupAndQuarter({ groupId: selectedGroupId, quarter: selectedQuarter }),
    // Barcha guruhlar bo'yicha: tekshirilishi kerak javoblar bir joyda ko'rinadi
    getHomeworkOverviewForMentor(),
    view === "journal" ? getHomeworkJournal(selectedGroupId, selectedQuarter) : null,
  ]);
  const stats = await getHomeworkStatsForLessons(lessons.map((l) => l._id.toString()));

  return (
    <LessonsManager
      key={`${selectedGroupId}-${selectedQuarter}-${view}`}
      groups={groups}
      initialLessons={lessons}
      selectedGroupId={selectedGroupId}
      selectedQuarter={selectedQuarter}
      view={view}
      stats={stats}
      toCheck={overview.filter((o) => o.ungraded > 0)}
      journal={journal}
    />
  );
}
