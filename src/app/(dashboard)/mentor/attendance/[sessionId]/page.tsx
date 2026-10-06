import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getAttendanceSessionForProjector, getAttendanceSessionDetail } from "@/actions/attendance.actions";
import { SessionDetailView } from "@/components/mentor/session-detail-view";
import { ProjectorScreen } from "@/components/attendance/projector-screen";

export const metadata = {
  title: "Dars davomati — ITXiva",
};

interface ProjectorPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function MentorProjectorPage({ params }: ProjectorPageProps) {
  await requireMentorPage();
  const resolvedParams = await params;

  // Yakunlangan dars: kim keldi / kelmadi — to'liq ro'yxat va tahrirlash
  const detail = await getAttendanceSessionDetail(resolvedParams.sessionId);
  if (!detail) {
    notFound();
  }
  if (detail.session.status === "closed") {
    return <SessionDetailView detail={detail} />;
  }

  const data = await getAttendanceSessionForProjector(resolvedParams.sessionId);
  if (!data) {
    notFound();
  }

  return <ProjectorScreen initialData={data} />;
}
