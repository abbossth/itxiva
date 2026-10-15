import { requireMentorPage } from "@/lib/auth/guards";
import { getQuestFormContext } from "@/actions/quest.actions";
import { QuestForm } from "@/components/mentor/quests/quest-form";
import { QUEST_TEMPLATES } from "@/lib/gamification/labels";

export const metadata = {
  title: "Yangi topshiriq — ITXiva",
};

export default async function NewQuestPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await requireMentorPage();
  const [{ template }, context] = await Promise.all([searchParams, getQuestFormContext()]);
  const tpl = QUEST_TEMPLATES.find((t) => t.id === template)?.id ?? null;
  return <QuestForm quest={null} template={tpl} context={context} />;
}
