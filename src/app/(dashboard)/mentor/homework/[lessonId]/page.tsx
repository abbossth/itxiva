import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getHomeworkRoster } from "@/actions/homework.actions";
import { HomeworkGradingView } from "@/components/homework/homework-grading-view";

export const metadata = {
  title: "Vazifani tekshirish — ITXiva",
};

interface PageProps {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ student?: string }>;
}

export default async function MentorHomeworkDetailPage({ params, searchParams }: PageProps) {
  await requireMentorPage();
  const { lessonId } = await params;
  const roster = await getHomeworkRoster(lessonId);
  if (!roster) notFound();
  // Jurnaldagi katakdan kelinganda o'sha o'quvchining javobi ochiladi
  const { student } = await searchParams;
  const initialStudentId = roster.rows.some((r) => r.studentId === student && r.submission) ? student : undefined;
  return <HomeworkGradingView roster={roster} initialStudentId={initialStudentId} />;
}
