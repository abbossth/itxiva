import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { GroupsManager } from "@/components/mentor/groups-manager";

export const metadata = {
  title: "Guruhlar boshqaruvi — ITXiva",
};

export default async function MentorGroupsPage() {
  await requireMentorPage();
  const groups = await getGroups();

  return <GroupsManager initialGroups={groups} />;
}
