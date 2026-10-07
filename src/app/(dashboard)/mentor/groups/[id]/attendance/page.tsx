import { requireMentorPage } from "@/lib/auth/guards";
import { notFound } from "next/navigation";
import { getGroupsAttendanceOverview } from "@/actions/attendance.actions";
import { getGroupById } from "@/actions/group.actions";
import { isValidSchedule } from "@/lib/schedule";
import { GroupAttendanceView } from "@/components/mentor/group-attendance-view";

export const metadata = {
  title: "Guruh davomati — ITXiva",
};

interface GroupAttendancePageProps {
  params: Promise<{ id: string }>;
}

export default async function GroupAttendancePage({ params }: GroupAttendancePageProps) {
  await requireMentorPage();
  const { id } = await params;
  const [group, overview] = await Promise.all([getGroupById(id), getGroupsAttendanceOverview()]);
  if (!group) notFound();

  return (
    <GroupAttendanceView
      groupId={id}
      schedule={isValidSchedule(group.schedule) ? group.schedule : null}
      activeSession={overview.active.find((s) => s.groupId === id) ?? null}
      todaySession={overview.today[id] ?? null}
    />
  );
}
