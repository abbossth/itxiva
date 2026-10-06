import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { getLessonById } from "@/actions/lesson.actions";
import { getQuizForMentor } from "@/actions/quiz.actions";
import { LessonEditorForm } from "@/components/mentor/lesson-editor-form";

// AI yordamchi taqdimot/konspekt tuzishi 1-2 daqiqa olishi mumkin
export const maxDuration = 300;

export const metadata = {
  title: "Darsni tahrirlash — ITXiva",
};

interface EditLessonPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditLessonPage({ params }: EditLessonPageProps) {
  await requireMentorPage();
  const resolvedParams = await params;

  const [lesson, groups, quizRes] = await Promise.all([
    getLessonById(resolvedParams.id),
    getGroups(),
    getQuizForMentor(resolvedParams.id),
  ]);

  if (!lesson) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/mentor/lessons"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Darslar boshqaruviga qaytish
        </Link>
      </div>

      <LessonEditorForm
        groups={groups}
        initialLesson={lesson}
        initialQuiz={quizRes.data ?? null}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </div>
  );
}
