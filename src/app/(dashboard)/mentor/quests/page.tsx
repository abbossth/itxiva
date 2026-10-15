import { requireMentorPage } from "@/lib/auth/guards";
import { getQuestsForMentor } from "@/actions/quest.actions";
import { QuestsManager } from "@/components/mentor/quests/quests-manager";

export const metadata = {
  title: "Topshiriqlar — ITXiva",
};

export default async function MentorQuestsPage() {
  await requireMentorPage();
  const data = await getQuestsForMentor();
  return <QuestsManager data={data} />;
}
