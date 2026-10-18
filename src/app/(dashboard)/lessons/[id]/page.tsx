import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLessonById } from "@/actions/lesson.actions";
import { getQuizForLesson } from "@/actions/quiz.actions";
import { getHomeworkForStudent } from "@/actions/homework.actions";
import { getCurrentUser } from "@/lib/auth/guards";
import { HomeworkPanel } from "@/components/homework/homework-panel";
import { hasLessonMain, LessonHeader, LessonMain, LessonPanelCard, lessonFiles } from "@/components/lessons/lesson-body";
import { FilePreview } from "@/components/lessons/file-preview";
import { LessonTabPanel, LessonTabs, type LessonTabDef } from "@/components/lessons/lesson-tabs";
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

  const [quizRes, homework] = await Promise.all([getQuizForLesson(resolvedParams.id), getHomeworkForStudent(resolvedParams.id)]);
  const quizData = quizRes.data;
  const lessonId = lesson._id.toString();
  const files = lessonFiles(lesson);

  // Bo'limlar: bo'shlari ko'rsatilmaydi
  const tabs: LessonTabDef[] = [];
  if (hasLessonMain(lesson)) tabs.push({ id: "lesson", label: "Dars", icon: "lesson" });
  if (files.length > 0) tabs.push({ id: "materials", label: "Materiallar", icon: "materials", meta: String(files.length) });
  if (homework) {
    const sub = homework.submission;
    tabs.push({
      id: "homework",
      label: "Uyga vazifa",
      icon: "homework",
      ...(!sub
        ? { meta: "Topshirilmagan", tone: "attention" as const }
        : sub.status === "returned"
        ? { meta: "Qayta ishlash", tone: "attention" as const }
        : sub.status === "graded"
        ? { meta: `${sub.score ?? 0} ball`, tone: "done" as const }
        : { meta: "Tekshirilmoqda" }),
    });
  }
  if (quizData?.quiz) {
    const sub = quizData.submission;
    tabs.push({
      id: "quiz",
      label: "Test",
      icon: "quiz",
      ...(!sub
        ? { meta: `${quizData.quiz.questions.length} savol`, tone: "attention" as const }
        : sub.status === "graded"
        ? { meta: `${sub.totalScore}/${sub.maxScore}`, tone: "done" as const }
        : { meta: "Tekshirilmoqda" }),
    });
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto animate-in fade-in">
      <div>
        <Link
          href="/lessons"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Darslar ro&apos;yxatiga qaytish
        </Link>
      </div>

      <LessonPanelCard>
        <LessonHeader lesson={lesson} />
      </LessonPanelCard>

      {tabs.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Bu darsga hali material qo&apos;shilmagan.</p>
      ) : (
        <LessonTabs tabs={tabs}>
          <LessonTabPanel id="lesson">
            <LessonPanelCard>
              <LessonMain lesson={lesson} />
            </LessonPanelCard>
          </LessonTabPanel>

          <LessonTabPanel id="materials">
            <LessonPanelCard>
              <FilePreview lessonId={lessonId} materials={lesson.materials ?? []} hideTitle />
            </LessonPanelCard>
          </LessonTabPanel>

          {homework && (
            <LessonTabPanel id="homework">
              <LessonPanelCard>
                <HomeworkPanel
                  // Javob yuborilgach yoki mentor baholagach forma holati yangidan boshlanadi
                  key={`${homework.submission?.status ?? "missing"}-${homework.submission?.attempt ?? 0}`}
                  lessonId={lessonId}
                  task={homework.task}
                  submission={homework.submission}
                  readOnly={viewer?.role !== "student"}
                />
              </LessonPanelCard>
            </LessonTabPanel>
          )}

          {quizData?.quiz && (
            <LessonTabPanel id="quiz">
              <QuizView lessonId={lessonId} quiz={quizData.quiz} initialSubmission={quizData.submission} role="student" />
            </LessonTabPanel>
          )}
        </LessonTabs>
      )}
    </div>
  );
}
