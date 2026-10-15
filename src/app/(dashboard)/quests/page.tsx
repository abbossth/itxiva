import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getStudentQuestsData } from "@/actions/student-quest.actions";
import { StudentQuestsView } from "@/components/quests/student-quests-view";

export const metadata = {
  title: "Topshiriqlar — ITXiva",
};

export default async function QuestsPage() {
  const session = await requireAuth();
  if (session.role === "mentor") redirect("/mentor/quests");
  const data = await getStudentQuestsData();
  // Gamifikatsiya o'chiq bo'lsa sahifa yo'q
  if (!data) notFound();
  return <StudentQuestsView data={data} />;
}
