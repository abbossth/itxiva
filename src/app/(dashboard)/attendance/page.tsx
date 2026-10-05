import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import {
  getActiveAttendanceSessionForStudent,
  getStudentAttendanceHistory,
} from "@/actions/attendance.actions";
import { StudentAttendanceView } from "@/components/attendance/student-attendance-view";

export const metadata = {
  title: "Davomat — ITXiva",
};

export default async function AttendancePage() {
  const session = await requireAuth();

  if (session.role === "mentor") {
    redirect("/mentor/attendance");
  }

  const [activeSession, history] = await Promise.all([
    getActiveAttendanceSessionForStudent(),
    getStudentAttendanceHistory(),
  ]);

  return (
    <StudentAttendanceView
      activeSession={activeSession}
      history={history}
    />
  );
}
