import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Edit3, Eye, Plus, Users } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getLessonById, getLinkedLessons } from "@/actions/lesson.actions";
import { LessonVisibility } from "@/components/mentor/lesson-visibility";
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
import { HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS, type HomeworkState } from "@/lib/homework-status";
import { SCORE_TONE, scoreTone } from "@/lib/score-tone";
import { groupShortName } from "@/lib/group-name";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Dars — ITXiva",
};

const pill = "inline-block min-w-[3.5rem] px-2 py-1 rounded-lg text-xs font-bold tabular-nums text-center";

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

      {/* O'quvchi ko'radigan ko'rinish */}
      <p className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
        <Eye className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
        {lesson.isPublished
          ? "Dars o'quvchilarga aynan shunday ko'rinadi. Fayllarni shu yerdan ochib, dars paytida ishlatishingiz mumkin."
          : "Bu qoralama — o'quvchilar hali ko'rmaydi. Nashr qilish uchun darsni tahrirlang."}
      </p>

      <LessonVisibility
        lessonId={id}
        groupName={group ? groupShortName(group) : null}
        homework={homework ? { open: Boolean(lesson.homework?.isEnabled), dueAt: lesson.homework?.dueAt ? new Date(lesson.homework.dueAt).toISOString() : null } : null}
        quiz={quiz ? { open: quiz.isPublished } : null}
        linked={linked}
      />

      <LessonPanelCard>
        <LessonHeader
          lesson={lesson}
          badges={
            <>
              {group && <Badge variant="teal">{groupShortName(group)}</Badge>}
              <Badge variant={lesson.isPublished ? "success" : "warning"}>{lesson.isPublished ? "Nashr etilgan" : "Qoralama"}</Badge>
            </>
          }
        />
      </LessonPanelCard>

      <LessonTabs tabs={tabs}>
        <LessonTabPanel id="lesson" className="space-y-3">
          <PanelBar href={editHref("lesson")} label="Konspekt va videoni tahrirlash" />
          <LessonPanelCard>
            {hasLessonMain(lesson) ? (
              <LessonMain lesson={lesson} />
            ) : (
              <EmptyPanel text="Konspekt ham, video ham yo'q." href={editHref("lesson")} action="Konspekt yozish" />
            )}
          </LessonPanelCard>
        </LessonTabPanel>

        <LessonTabPanel id="materials" className="space-y-3">
          <PanelBar href={editHref("materials")} label="Materiallarni tahrirlash" />
          <LessonPanelCard>
            {files.length > 0 ? (
              <FilePreview lessonId={id} materials={lesson.materials ?? []} hideTitle />
            ) : (
              <EmptyPanel text="Fayl yoki havola qo'shilmagan." href={editHref("materials")} action="Material qo'shish" />
            )}
          </LessonPanelCard>
        </LessonTabPanel>

        <LessonTabPanel id="homework" className="space-y-3">
          <PanelBar href={editHref("homework")} label="Vazifani tahrirlash">
            {homework && !lesson.homework?.isEnabled && <Badge variant="warning">Vazifa yopiq — o&apos;quvchilarga ko&apos;rinmaydi</Badge>}
          </PanelBar>
          <LessonPanelCard>
            {homework ? (
              <HomeworkPanel lessonId={id} task={homework.task} submission={null} readOnly />
            ) : (
              <EmptyPanel text="Bu darsda uyga vazifa yo'q." href={editHref("homework")} action="Vazifa berish" />
            )}
          </LessonPanelCard>
        </LessonTabPanel>

        <LessonTabPanel id="quiz" className="space-y-3">
          <PanelBar href={editHref("quiz")} label="Testni tahrirlash">
            {quiz && !quiz.isPublished && <Badge variant="warning">Test yopiq — o&apos;quvchilarga ko&apos;rinmaydi</Badge>}
          </PanelBar>
          {quiz ? (
            <QuizView lessonId={id} quiz={quiz} initialSubmission={null} role="mentor" />
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 pr-2 text-left font-bold">O&apos;quvchi</th>
                      {roster && <th className="px-2 py-2 text-center font-bold">Uyga vazifa</th>}
                      {quiz && <th className="px-2 py-2 text-center font-bold">Test</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-1.5 pr-2">
                          <Link href={`/mentor/students/${r.id}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                            {r.fullName}
                          </Link>
                        </td>
                        {roster && (
                          <td className="px-2 py-1.5 text-center">
                            {r.homeworkScore !== null ? (
                              <span className={cn(pill, SCORE_TONE[scoreTone(r.homeworkScore)].soft)}>{r.homeworkScore} / 100</span>
                            ) : (
                              <Badge variant={HOMEWORK_STATE_BADGE[r.homeworkState]}>{HOMEWORK_STATE_LABELS[r.homeworkState]}</Badge>
                            )}
                          </td>
                        )}
                        {quiz && (
                          <td className="px-2 py-1.5 text-center">
                            {r.quiz ? (
                              <span className={cn(pill, SCORE_TONE[scoreTone(r.quiz.percent)].soft)}>
                                {r.quiz.score} / {r.quiz.max}
                              </span>
                            ) : (
                              <span className={cn(pill, SCORE_TONE.none.soft)}>—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </LessonTabPanel>
      </LessonTabs>
    </div>
  );
}

/** Tab tepasidagi qator: holat belgilari va shu bo'limni tahrirlash tugmasi */
function PanelBar({ href, label, children }: { href: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <Link href={href} className={buttonVariants({ variant: "outline", size: "sm", className: "min-h-[40px] ml-auto" })}>
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
