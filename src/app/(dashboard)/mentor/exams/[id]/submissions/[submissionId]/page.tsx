import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getExamSubmissionDetailsForMentor } from "@/actions/exam.actions";
import { ExamGradingView } from "@/components/mentor/exam-grading-view";

interface GradingPageProps {
  params: Promise<{ id: string; submissionId: string }>;
}

export const metadata = {
  title: "Topshiriqni baholash — ITXiva",
};

export default async function GradingPage({ params }: GradingPageProps) {
  await requireMentorPage();
  const resolvedParams = await params;

  const res = await getExamSubmissionDetailsForMentor(resolvedParams.submissionId);

  if (!res.success || !res.data) {
    notFound();
  }

  const { submission, studentName, studentLogin, groupName, exam, fileDownloadUrls } =
    res.data;

  return (
    <ExamGradingView
      submission={submission}
      studentName={studentName}
      studentLogin={studentLogin}
      groupName={groupName}
      exam={exam}
      fileDownloadUrls={fileDownloadUrls}
    />
  );
}
