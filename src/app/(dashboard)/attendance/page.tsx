import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import {
  getActiveAttendanceSessionForStudent,
  getStudentAttendanceHistory,
} from "@/actions/attendance.actions";
import { StudentAttendanceView } from "@/components/attendance/student-attendance-view";
import { getGroups } from "@/actions/group.actions";
import { getNextLesson } from "@/lib/schedule";

export const metadata = {
  title: "Davomat — ITXiva",
};

export default async function AttendancePage() {
  const session = await requireAuth();

  if (session.role === "mentor") {
    redirect("/mentor/attendance");
  }

  const [activeSession, history, groups] = await Promise.all([
    getActiveAttendanceSessionForStudent(),
    getStudentAttendanceHistory(),
    getGroups(),
  ]);
  const nextLesson = getNextLesson(groups[0]?.schedule);

  return (
    <StudentAttendanceView
      activeSession={activeSession}
      history={history}
      nextLessonLabel={nextLesson?.label ?? null}
    />
  );
}
