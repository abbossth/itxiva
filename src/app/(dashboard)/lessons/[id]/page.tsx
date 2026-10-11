import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLessonById } from "@/actions/lesson.actions";
import { getQuizForLesson } from "@/actions/quiz.actions";
import { getHomeworkForStudent } from "@/actions/homework.actions";
import { getCurrentUser } from "@/lib/auth/guards";
import { HomeworkPanel } from "@/components/homework/homework-panel";
import { LessonBody } from "@/components/lessons/lesson-body";
import { QuizView } from "@/components/quiz/quiz-view";

interface LessonDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LessonDetailPage({ params }: LessonDetailPageProps) {
  const resolvedParams = await params;
  let lesson = null;

  try {
    lesson = await getLessonById(resolvedParams.id);
  } catch {
    notFound();
  }

  if (!lesson) {
    notFound();
  }

  const viewer = await getCurrentUser();
  // Mentor uchun darsning o'z ko'rinishi bor: xuddi shu mazmun + tahrirlash va o'quvchilar natijalari
  if (viewer?.role === "mentor") {
    redirect(`/mentor/lessons/${lesson._id}`);
  }

  const [quizRes, homework, session] = await Promise.all([
    getQuizForLesson(resolvedParams.id),
    getHomeworkForStudent(resolvedParams.id),
    getCurrentUser(),
  ]);
  const quizData = quizRes.data;

  return (
    <div className="space-y-4 max-w-4xl mx-auto animate-in fade-in">
      {/* Back button */}
      <div>
        <Link
          href="/lessons"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Darslar ro&apos;yxatiga qaytish
        </Link>
      </div>

      {/* Main card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-5 sm:p-8 space-y-6 shadow-xs">
        <LessonBody lesson={lesson} />

        {/* Uyga vazifa */}
        {homework && (
          <div id="homework" className="pt-4 border-t border-slate-100 dark:border-slate-800 scroll-mt-24">
            <HomeworkPanel
              // Javob yuborilgach yoki mentor baholagach forma holati yangidan boshlanadi
              key={`${homework.submission?.status ?? "missing"}-${homework.submission?.attempt ?? 0}`}
              lessonId={lesson._id.toString()}
              task={homework.task}
              submission={homework.submission}
              readOnly={session?.role !== "student"}
            />
          </div>
        )}

        {/* Lesson Quiz */}
        {quizData?.quiz && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <QuizView
              lessonId={lesson._id.toString()}
              quiz={quizData.quiz}
              initialSubmission={quizData.submission}
              role="student"
            />
          </div>
        )}
      </div>
    </div>
  );
}
