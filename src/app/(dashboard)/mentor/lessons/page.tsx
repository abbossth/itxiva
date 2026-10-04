import { requireMentor } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { getLessonsByGroupAndQuarter } from "@/actions/lesson.actions";
import { LessonsManager } from "@/components/mentor/lessons-manager";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface MentorLessonsPageProps {
  searchParams: Promise<{
    groupId?: string;
    quarter?: string;
  }>;
}

export default async function MentorLessonsPage({ searchParams }: MentorLessonsPageProps) {
  await requireMentor();
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

  const selectedGroupId = resolvedSearchParams.groupId || groups[0]._id.toString();
  const selectedQuarter = resolvedSearchParams.quarter ? parseInt(resolvedSearchParams.quarter, 10) : 1;

  const lessons = await getLessonsByGroupAndQuarter({
    groupId: selectedGroupId,
    quarter: selectedQuarter,
  });

  return (
    <LessonsManager
      groups={groups}
      initialLessons={lessons}
      selectedGroupId={selectedGroupId}
      selectedQuarter={selectedQuarter}
    />
  );
}
