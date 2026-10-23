import { notFound } from "next/navigation";
import Link from "@/components/ui/link";
import { ArrowLeft, ClipboardCheck, Edit3, Eye, Plus, Users } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getLessonById, getLinkedLessons } from "@/actions/lesson.actions";
import { LinkedGroupsStrip, VisibilityToggle } from "@/components/mentor/lesson-visibility";
import { getGroupById } from "@/actions/group.actions";
import { getStudentsByGroup } from "@/actions/student.actions";
import { getQuizForMentor, getQuizReviewQueue, getQuizSubmissionsForLesson } from "@/actions/quiz.actions";
import { QuizReviewPanel } from "@/components/mentor/quiz-review-panel";
import { getHomeworkForStudent, getHomeworkRoster } from "@/actions/homework.actions";
import { LessonHeader, LessonMain, LessonPanelCard, hasLessonMain, lessonFiles } from "@/components/lessons/lesson-body";
import { FilePreview } from "@/components/lessons/file-preview";
import { LessonTabPanel, LessonTabs, type LessonTabDef } from "@/components/lessons/lesson-tabs";
import { HomeworkPanel } from "@/components/homework/homework-panel";
import { QuizView } from "@/components/quiz/quiz-view";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RefreshButton } from "@/components/ui/refresh-button";
import { LessonResultsTable } from "@/components/mentor/lesson-results-table";
import { type HomeworkState } from "@/lib/homework-status";
import { SCORE_TONE, scoreTone } from "@/lib/score-tone";
import { groupShortName } from "@/lib/group-name";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Dars — ITXiva",
};


export default async function MentorLessonViewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMentorPage();
  const { id } = await params;
  const lesson = await getLessonById(id);
  if (!lesson) {
    notFound();
  }

  const groupId = lesson.groupId.toString();
  const [group, students, homework, roster, quizRes, quizSubsRes, quizReviewRes, linked] = await Promise.all([
    getGroupById(groupId),
    getStudentsByGroup(groupId),
    getHomeworkForStudent(id),
    getHomeworkRoster(id),
    getQuizForMentor(id),
    getQuizSubmissionsForLesson(id),
    getQuizReviewQueue(id),
    getLinkedLessons(id),
  ]);
  const quizReview = quizReviewRes.data ?? [];
  const quiz = quizRes.data ?? null;
  const quizSubs = quizSubsRes.data ?? [];

  const homeworkByStudent = new Map((roster?.rows ?? []).map((r) => [r.studentId, r]));
  const quizByLogin = new Map(quizSubs.map((q) => [q.studentLogin, q]));
  const rows = students.map((s) => {
    const hw = homeworkByStudent.get(s._id.toString());
    const q = quizByLogin.get(s.login);
    return {
      id: s._id.toString(),
      fullName: s.fullName,
      homeworkState: (hw?.state ?? "missing") as HomeworkState,
      homeworkScore: hw?.submission?.status === "graded" ? hw.submission.score ?? null : null,
      quiz: q ? { score: q.totalScore, max: q.maxScore, percent: q.maxScore > 0 ? Math.round((q.totalScore / q.maxScore) * 100) : null } : null,
    };
  });
  const submitted = rows.filter((r) => r.homeworkState !== "missing").length;
  const ungraded = rows.filter((r) => r.homeworkState === "submitted").length;
  const quizTaken = rows.filter((r) => r.quiz).length;
  const backHref = `/mentor/lessons?groupId=${groupId}&quarter=${lesson.quarter}`;
  const editHref = (tab: string) => `/mentor/lessons/${id}/edit?tab=${tab}`;
  const files = lessonFiles(lesson);
  const toCheck = ungraded + quizReview.filter((q) => q.status === "submitted").length;

  // Mentor barcha bo'limlarni ko'radi: bo'shida "qo'shish" taklifi chiqadi
  const tabs: LessonTabDef[] = [
    { id: "lesson", label: "Dars", icon: "lesson" },
    { id: "materials", label: "Materiallar", icon: "materials", meta: String(files.length), tone: files.length ? "default" : "muted" },
    {
      id: "homework",
      label: "Uyga vazifa",
      icon: "homework",
      ...(!homework
        ? { meta: "Yo'q", tone: "muted" as const }
        : !lesson.homework?.isEnabled
        ? { meta: "Yopiq", tone: "muted" as const }
        : { meta: `${submitted}/${students.length}` }),
    },
    {
      id: "quiz",
      label: "Test",
      icon: "quiz",
      ...(!quiz
        ? { meta: "Yo'q", tone: "muted" as const }
        : !quiz.isPublished
        ? { meta: "Yopiq", tone: "muted" as const }
        : { meta: `${quiz.questions.length} savol` }),
    },
    {
      id: "results",
      label: "Natijalar",
      icon: "results",
      ...(toCheck > 0 ? { meta: `${toCheck} tekshirish`, tone: "attention" as const } : {}),
    },
  ];

  return (
    <div className="space-y-4 max-w-4xl mx-auto animate-in fade-in pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Darslar ro&apos;yxatiga qaytish
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {roster && (
            <Link href={`/mentor/homework/${id}`} className={buttonVariants({ variant: ungraded > 0 ? "gold" : "outline", size: "sm", className: "min-h-[40px]" })}>
              <ClipboardCheck className="w-4 h-4" />
              {ungraded > 0 ? `Vazifalarni tekshirish (${ungraded})` : "Vazifa javoblari"}
            </Link>
          )}
          <Link href={`/mentor/lessons/${id}/edit`} className={buttonVariants({ variant: "primary", size: "sm", className: "min-h-[40px]" })}>
            <Edit3 className="w-4 h-4" />
            Tahrirlash
          </Link>
        </div>
      </div>

      <LessonPanelCard className="space-y-4">
        <LessonHeader
          lesson={lesson}
          badges={
            <>
              {group && <Badge variant="teal">{groupShortName(group)}</Badge>}
              <Badge variant={lesson.isPublished ? "success" : "warning"}>{lesson.isPublished ? "Nashr etilgan" : "Qoralama"}</Badge>
            </>
          }
        />
        {!lesson.isPublished && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            <Eye className="w-4 h-4 shrink-0" />
            Bu qoralama — o&apos;quvchilar hali ko&apos;rmaydi. Nashr qilish uchun darsni tahrirlang.
          </p>
        )}
        <LinkedGroupsStrip linked={linked} />
      </LessonPanelCard>

      <LessonTabs tabs={tabs}>
        <LessonTabPanel id="lesson">
          <LessonPanelCard>
            {hasLessonMain(lesson) ? (
              <>
                <LessonMain lesson={lesson} />
                <PanelFooter href={editHref("lesson")} label="Konspekt va videoni tahrirlash" />
              </>
            ) : (
              <EmptyPanel text="Konspekt ham, video ham yo'q." href={editHref("lesson")} action="Konspekt yozish" />
            )}
          </LessonPanelCard>
        </LessonTabPanel>

        <LessonTabPanel id="materials">
          <LessonPanelCard>
            {files.length > 0 ? (
              <>
                <FilePreview lessonId={id} materials={lesson.materials ?? []} hideTitle />
                <PanelFooter href={editHref("materials")} label="Materiallarni tahrirlash" />
              </>
            ) : (
              <EmptyPanel text="Fayl yoki havola qo'shilmagan." href={editHref("materials")} action="Material qo'shish" />
            )}
          </LessonPanelCard>
        </LessonTabPanel>

        <LessonTabPanel id="homework">
          <LessonPanelCard>
            {homework ? (
              <>
                <HomeworkPanel lessonId={id} task={homework.task} submission={null} readOnly />
                <PanelFooter href={editHref("homework")} label="Tahrirlash">
                  <VisibilityToggle
                    lessonId={id}
                    kind="homework"
                    open={Boolean(lesson.homework?.isEnabled)}
                    dueAt={lesson.homework?.dueAt ? new Date(lesson.homework.dueAt).toISOString() : null}
                    groupName={group ? groupShortName(group) : null}
                  />
                </PanelFooter>
              </>
            ) : (
              <EmptyPanel text="Bu darsda uyga vazifa yo'q." href={editHref("homework")} action="Vazifa berish" />
            )}
          </LessonPanelCard>
        </LessonTabPanel>

        <LessonTabPanel id="quiz">
          {quiz ? (
            <QuizView
              lessonId={id}
              quiz={quiz}
              initialSubmission={null}
              role="mentor"
              footer={
                <PanelFooter href={editHref("quiz")} label="Tahrirlash">
                  <VisibilityToggle lessonId={id} kind="quiz" open={quiz.isPublished} groupName={group ? groupShortName(group) : null} />
                </PanelFooter>
              }
            />
          ) : (
            <LessonPanelCard>
              <EmptyPanel text="Bu darsda test yo'q." href={editHref("quiz")} action="Test tuzish" />
            </LessonPanelCard>
          )}
        </LessonTabPanel>

        <LessonTabPanel id="results" className="space-y-4">
          <QuizReviewPanel lessonId={id} items={quizReview} />
          {/* O'quvchilar natijalari: faqat mentor ko'radi */}
          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  O&apos;quvchilar natijalari
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {group ? `${group.name} · ` : ""}
                  {students.length} o&apos;quvchi. Bu bo&apos;limni faqat siz ko&apos;rasiz
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                {roster && (
                  <span className={cn("px-2 py-1 rounded-md", SCORE_TONE[scoreTone(students.length > 0 ? (submitted / students.length) * 100 : null)].soft)}>
                    Vazifa: {submitted} / {students.length}
                  </span>
                )}
                {quiz && (
                  <span className={cn("px-2 py-1 rounded-md", SCORE_TONE[scoreTone(students.length > 0 ? (quizTaken / students.length) * 100 : null)].soft)}>
                    Test: {quizTaken} / {students.length}
                  </span>
                )}
                {/* Dars paytida javoblar kelib turadi: jadval o'zi har 30 soniyada yangilanadi */}
                <RefreshButton intervalMs={30_000} />
              </div>
            </div>

            {!roster && !quiz ? (
              <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                Bu darsda uyga vazifa ham, test ham yo&apos;q — natijalar shular qo&apos;shilgach ko&apos;rinadi.{" "}
                <Link href={editHref("homework")} className="font-semibold text-teal-700 dark:text-teal-300 hover:underline">
                  Vazifa qo&apos;shish
                </Link>
              </p>
            ) : rows.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">Guruhda o&apos;quvchi yo&apos;q</p>
            ) : (
              <LessonResultsTable rows={rows} showHomework={Boolean(roster)} showQuiz={Boolean(quiz)} />
            )}
          </section>
        </LessonTabPanel>
      </LessonTabs>
    </div>
  );
}

/** Karta ichida, eng pastda: holat (ochish/yopish) va shu bo'limni tahrirlash tugmasi */
function PanelFooter({ href, label, children }: { href: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
      {children}
      <Link href={href} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-[40px] ml-auto shrink-0" })}>
        <Edit3 className="w-4 h-4" />
        {label}
      </Link>
    </div>
  );
}

function EmptyPanel({ text, href, action }: { text: string; href: string; action: string }) {
  return (
    <div className="py-6 flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
      <Link href={href} className={buttonVariants({ variant: "secondary", size: "sm", className: "min-h-[40px]" })}>
        <Plus className="w-4 h-4" />
        {action}
      </Link>
    </div>
  );
}
