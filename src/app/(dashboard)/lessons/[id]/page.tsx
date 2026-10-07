import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, BookOpen } from "lucide-react";
import { getLessonById } from "@/actions/lesson.actions";
import { getQuizForLesson } from "@/actions/quiz.actions";
import { getHomeworkForStudent } from "@/actions/homework.actions";
import { getCurrentUser } from "@/lib/auth/guards";
import { HomeworkPanel } from "@/components/homework/homework-panel";
import { YouTubeFacade } from "@/components/lessons/youtube-facade";
import { FilePreview } from "@/components/lessons/file-preview";
import { QuizView } from "@/components/quiz/quiz-view";
import { formatDateUz } from "@/lib/utils";

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

  const [quizRes, homework, session] = await Promise.all([
    getQuizForLesson(resolvedParams.id),
    getHomeworkForStudent(resolvedParams.id),
    getCurrentUser(),
  ]);
  const quizData = quizRes.data;

  const youtubeMaterial = lesson.materials?.find((m) => m.type === "youtube");

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
        <div className="space-y-2 border-b border-slate-100 dark:border-slate-800/80 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              {lesson.quarter}-chorak &bull; {lesson.order}-dars
            </span>
            {lesson.date && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                {formatDateUz(lesson.date)}
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {lesson.title}
          </h1>

          {lesson.topic && (
            <p className="text-sm sm:text-base font-medium text-teal-600 dark:text-teal-400">
              {lesson.topic}
            </p>
          )}
        </div>

        {/* YouTube Video Player Facade */}
        {youtubeMaterial && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-red-500" />
              Dars videosi
            </h2>
            <YouTubeFacade
              url={youtubeMaterial.urlOrKey}
              title={youtubeMaterial.title || lesson.title}
            />
          </div>
        )}

        {/* Lesson Description */}
        {lesson.description && (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Dars tavsifi
            </h2>
            <div className="text-sm sm:text-base text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
              {lesson.description}
            </div>
          </div>
        )}

        {/* Files and links */}
        {lesson.materials && lesson.materials.length > 0 && (
          <div className="pt-2">
            <FilePreview
              lessonId={lesson._id.toString()}
              materials={lesson.materials}
            />
          </div>
        )}

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
