import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getStudentReport } from "@/actions/report.actions";
import { StudentReportView } from "@/components/reports/student-report-view";

export const metadata = {
  title: "O'quvchi hisoboti — ITXiva",
};

export default async function StudentReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMentorPage();
  const { id } = await params;
  const report = await getStudentReport(id);
  if (!report) {
    notFound();
  }
  return <StudentReportView report={report} />;
}
