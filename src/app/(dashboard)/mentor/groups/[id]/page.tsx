import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getGroupById, getGroups } from "@/actions/group.actions";
import { getStudentsByGroup } from "@/actions/student.actions";
import { getStudentPhotoUrls } from "@/actions/student-profile.actions";
import { GroupStudentsView } from "@/components/mentor/group-students-view";

export const metadata = {
  title: "Guruh o'quvchilari — ITXiva",
};

interface GroupDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function GroupDetailPage({ params }: GroupDetailPageProps) {
  await requireMentorPage();
  const resolvedParams = await params;

  const [group, students, allGroups] = await Promise.all([
    getGroupById(resolvedParams.id),
    getStudentsByGroup(resolvedParams.id),
    getGroups(),
  ]);

  if (!group) {
    notFound();
  }

  const photoUrls = await getStudentPhotoUrls(students.map((s) => s._id.toString()));

  return (
    <GroupStudentsView
      group={group}
      photoUrls={photoUrls}
      initialStudents={students}
      allGroups={allGroups}
    />
  );
}
