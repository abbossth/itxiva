import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getQuestForMentor, getQuestFormContext } from "@/actions/quest.actions";
import { QuestForm } from "@/components/mentor/quests/quest-form";

export const metadata = {
  title: "Topshiriqni tahrirlash — ITXiva",
};

export default async function EditQuestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMentorPage();
  const { id } = await params;
  const [quest, context] = await Promise.all([getQuestForMentor(id), getQuestFormContext()]);
  if (!quest) notFound();
  return <QuestForm quest={quest} template={null} context={context} />;
}
