import { requireMentorPage } from "@/lib/auth/guards";
import { getGroupsAttendanceOverview } from "@/actions/attendance.actions";
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
  const overview = await getGroupsAttendanceOverview();

  return (
    <GroupAttendanceView
      groupId={id}
      activeSession={overview.active.find((s) => s.groupId === id) ?? null}
      todaySession={overview.today[id] ?? null}
    />
  );
}
