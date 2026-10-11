import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, Edit3, Eye, Users } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getLessonById } from "@/actions/lesson.actions";
import { getGroupById } from "@/actions/group.actions";
import { getStudentsByGroup } from "@/actions/student.actions";
import { getQuizForMentor, getQuizSubmissionsForLesson } from "@/actions/quiz.actions";
import { getHomeworkForStudent, getHomeworkRoster } from "@/actions/homework.actions";
import { LessonBody } from "@/components/lessons/lesson-body";
import { HomeworkPanel } from "@/components/homework/homework-panel";
import { QuizView } from "@/components/quiz/quiz-view";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
  const [group, students, homework, roster, quizRes, quizSubsRes] = await Promise.all([
    getGroupById(groupId),
    getStudentsByGroup(groupId),
    getHomeworkForStudent(id),
    getHomeworkRoster(id),
    getQuizForMentor(id),
    getQuizSubmissionsForLesson(id),
  ]);
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

      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-5 sm:p-8 space-y-6 shadow-xs">
        <LessonBody
          lesson={lesson}
          badges={
            <>
              {group && <Badge variant="teal">{groupShortName(group)}</Badge>}
              <Badge variant={lesson.isPublished ? "success" : "warning"}>{lesson.isPublished ? "Nashr etilgan" : "Qoralama"}</Badge>
            </>
          }
        />

        {homework && (
          <div id="homework" className="pt-4 border-t border-slate-100 dark:border-slate-800 scroll-mt-24">
            <HomeworkPanel lessonId={id} task={homework.task} submission={null} readOnly />
          </div>
        )}

        {quiz && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            {!quiz.isPublished && <Badge variant="warning">Test qoralama holatida — o&apos;quvchilarga ko&apos;rinmaydi</Badge>}
            <QuizView lessonId={id} quiz={quiz} initialSubmission={null} role="mentor" />
          </div>
        )}
      </div>

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
          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
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
          </div>
        </div>

        {!roster && !quiz ? (
          <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
            Bu darsda uyga vazifa ham, test ham yo&apos;q — natijalar shular qo&apos;shilgach ko&apos;rinadi.{" "}
            <Link href={`/mentor/lessons/${id}/edit#homework`} className="font-semibold text-teal-700 dark:text-teal-300 hover:underline">
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
    </div>
  );
}
