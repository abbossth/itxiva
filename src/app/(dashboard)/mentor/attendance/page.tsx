import { requireMentorPage } from "@/lib/auth/guards";
import { getAttendanceSessionsForMentor } from "@/actions/attendance.actions";
import { getGroups } from "@/actions/group.actions";
import { AttendanceSessionsView } from "@/components/mentor/attendance-sessions-view";

export const metadata = {
  title: "Davomat boshqaruvi — ITXiva",
};

export default async function MentorAttendancePage() {
  await requireMentorPage();

  const [sessions, groups] = await Promise.all([
    getAttendanceSessionsForMentor(),
    getGroups(),
  ]);

  return <AttendanceSessionsView sessions={sessions} groups={groups} />;
}
