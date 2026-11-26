import { after } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { retryFailedAiWork } from "@/lib/ai/retry";
import { getMentorDashboard, getStudentDashboard, getStudentHomeStats } from "@/actions/dashboard.actions";
import { getStudentQuestsData } from "@/actions/student-quest.actions";
import { MentorDashboardView } from "@/components/dashboard/mentor-dashboard";
import { StudentDashboardView } from "@/components/dashboard/student-dashboard";
import { getActivePromos } from "@/actions/promo.actions";
import { PromoBoard } from "@/components/promo/promo-board";

export const metadata = {
  title: "Bosh sahifa — ITXiva",
};

export default async function DashboardPage() {
  const session = await requireAuth();

  if (session.role === "mentor") {
    // Kun davomida (AI limiti tiklangach) bajarilmay qolgan AI tekshiruvlari fonda qayta bajariladi — soatiga bir marta
    after(() => retryFailedAiWork().catch((error) => console.error("AI retry error:", error)));
    const [data, promos] = await Promise.all([getMentorDashboard(), getActivePromos().catch(() => [])]);
    return <MentorDashboardView data={data} promos={<PromoBoard promos={promos} role="mentor" />} />;
  }
  const [data, stats, quests, promos] = await Promise.all([getStudentDashboard(), getStudentHomeStats(), getStudentQuestsData(), getActivePromos().catch(() => [])]);
  return <StudentDashboardView data={data} stats={stats} quests={quests} promos={<PromoBoard promos={promos} role="student" />} />;
}
