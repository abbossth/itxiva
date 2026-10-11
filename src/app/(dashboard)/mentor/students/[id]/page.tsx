import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getStudentProfile } from "@/actions/student-profile.actions";
import { StudentProfileView } from "@/components/students/student-profile-view";

export const metadata = {
  title: "O'quvchi profili — ITXiva",
};

export default async function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireMentorPage();
  const { id } = await params;
  const profile = await getStudentProfile(id);
  if (!profile) {
    notFound();
  }
  // Ma'lumot saqlangach forma yangi qiymatlar bilan qayta ochiladi
  return <StudentProfileView key={JSON.stringify(profile.personal) + profile.report.student.fullName} profile={profile} />;
}
