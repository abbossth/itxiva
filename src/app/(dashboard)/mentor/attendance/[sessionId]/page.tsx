import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getAttendanceSessionForProjector } from "@/actions/attendance.actions";
import { ProjectorScreen } from "@/components/attendance/projector-screen";

export const metadata = {
  title: "Davomat proyektor ekrani — ITXiva",
};

interface ProjectorPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function MentorProjectorPage({ params }: ProjectorPageProps) {
  await requireMentorPage();
  const resolvedParams = await params;

  const data = await getAttendanceSessionForProjector(resolvedParams.sessionId);
  if (!data) {
    notFound();
  }

  return <ProjectorScreen initialData={data} />;
}
