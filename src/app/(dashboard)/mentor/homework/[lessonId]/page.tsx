import { notFound } from "next/navigation";
import { requireMentorPage } from "@/lib/auth/guards";
import { getHomeworkRoster } from "@/actions/homework.actions";
import { HomeworkGradingView } from "@/components/homework/homework-grading-view";

export const metadata = {
  title: "Vazifani tekshirish — ITXiva",
};

interface PageProps {
  params: Promise<{ lessonId: string }>;
}

export default async function MentorHomeworkDetailPage({ params }: PageProps) {
  await requireMentorPage();
  const { lessonId } = await params;
  const roster = await getHomeworkRoster(lessonId);
  if (!roster) notFound();
  return <HomeworkGradingView roster={roster} />;
}
