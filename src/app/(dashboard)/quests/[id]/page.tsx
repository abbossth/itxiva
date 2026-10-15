import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getStudentQuestDetail } from "@/actions/quest-review.actions";
import { QuestDetailView } from "@/components/quests/quest-detail-view";

export const metadata = {
  title: "Topshiriq — ITXiva",
};

export default async function QuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const { id } = await params;
  if (session.role === "mentor") redirect(`/mentor/quests/${id}/edit`);
  const data = await getStudentQuestDetail(id);
  if (!data) notFound();
  return <QuestDetailView data={data} />;
}
