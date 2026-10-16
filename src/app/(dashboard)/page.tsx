import { after } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { retryFailedAiWork } from "@/lib/ai/retry";
import { getMentorDashboard, getStudentDashboard, getStudentHomeStats } from "@/actions/dashboard.actions";
import { getStudentQuestsData } from "@/actions/student-quest.actions";
import { MentorDashboardView } from "@/components/dashboard/mentor-dashboard";
import { StudentDashboardView } from "@/components/dashboard/student-dashboard";

export const metadata = {
  title: "Bosh sahifa — ITXiva",
};

export default async function DashboardPage() {
  const session = await requireAuth();

  if (session.role === "mentor") {
    // Kun davomida (AI limiti tiklangach) bajarilmay qolgan AI tekshiruvlari fonda qayta bajariladi — soatiga bir marta
    after(() => retryFailedAiWork().catch((error) => console.error("AI retry error:", error)));
    return <MentorDashboardView data={await getMentorDashboard()} />;
  }
  const [data, stats, quests] = await Promise.all([getStudentDashboard(), getStudentHomeStats(), getStudentQuestsData()]);
  return <StudentDashboardView data={data} stats={stats} quests={quests} />;
}
