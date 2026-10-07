import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { getGroupsAttendanceOverview } from "@/actions/attendance.actions";
import { GroupsManager } from "@/components/mentor/groups-manager";

export const metadata = {
  title: "Guruhlar — ITXiva",
};

export default async function MentorGroupsPage() {
  await requireMentorPage();
  const [groups, attendance] = await Promise.all([getGroups(), getGroupsAttendanceOverview()]);

  return <GroupsManager initialGroups={groups} attendance={attendance} />;
}
