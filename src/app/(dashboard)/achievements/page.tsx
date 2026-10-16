import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getAchievementsData } from "@/actions/student-quest.actions";
import { AchievementsView } from "@/components/quests/achievements-view";

export const metadata = {
  title: "Yutuqlarim — ITXiva",
};

export default async function AchievementsPage() {
  const session = await requireAuth();
  if (session.role === "mentor") redirect("/mentor/quests/badges");
  const data = await getAchievementsData();
  if (!data) notFound();
  return <AchievementsView data={data} />;
}
