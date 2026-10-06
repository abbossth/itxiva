import { requireAuth } from "@/lib/auth/guards";
import { getMentorDashboard, getStudentDashboard } from "@/actions/dashboard.actions";
import { MentorDashboardView } from "@/components/dashboard/mentor-dashboard";
import { StudentDashboardView } from "@/components/dashboard/student-dashboard";

export const metadata = {
  title: "Bosh sahifa — ITXiva",
};

export default async function DashboardPage() {
  const session = await requireAuth();

  if (session.role === "mentor") {
    return <MentorDashboardView data={await getMentorDashboard()} />;
  }
  return <StudentDashboardView data={await getStudentDashboard()} />;
}
