import { requireMentor } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { GroupsManager } from "@/components/mentor/groups-manager";

export default async function MentorGroupsPage() {
  await requireMentor();
  const groups = await getGroups();

  return <GroupsManager initialGroups={groups} />;
}
