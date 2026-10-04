import { notFound } from "next/navigation";
import { requireMentor } from "@/lib/auth/guards";
import { getGroupById, getGroups } from "@/actions/group.actions";
import { getStudentsByGroup } from "@/actions/student.actions";
import { GroupStudentsView } from "@/components/mentor/group-students-view";

interface GroupDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function GroupDetailPage({ params }: GroupDetailPageProps) {
  await requireMentor();
  const resolvedParams = await params;

  const [group, students, allGroups] = await Promise.all([
    getGroupById(resolvedParams.id),
    getStudentsByGroup(resolvedParams.id),
    getGroups(),
  ]);

  if (!group) {
    notFound();
  }

  return (
    <GroupStudentsView
      group={group}
      initialStudents={students}
      allGroups={allGroups}
    />
  );
}
