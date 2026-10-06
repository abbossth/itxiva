import { notFound } from "next/navigation";
import Link from "next/link";
import { requireMentorPage } from "@/lib/auth/guards";
import {
  getExamByIdForMentor,
  getExamSubmissionsForMentor,
} from "@/actions/exam.actions";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Users,
  Clock,
  FileCheck,
  Edit,
  ExternalLink,
} from "lucide-react";
import { formatDateTimeUz } from "@/lib/utils";

interface ExamSubmissionsPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Topshiriqlar va Baholash — ITXiva",
};

export default async function ExamSubmissionsPage({ params }: ExamSubmissionsPageProps) {
  await requireMentorPage();
  const resolvedParams = await params;

  const [examRes, submissionsRes] = await Promise.all([
    getExamByIdForMentor(resolvedParams.id),
    getExamSubmissionsForMentor(resolvedParams.id),
  ]);

  if (!examRes.success || !examRes.data) {
    notFound();
  }

  const exam = examRes.data;
  const submissions = submissionsRes.data || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in pb-16">
      <div>
        <Link
          href="/mentor/exams"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Imtihonlar ro&apos;yxatiga qaytish
        </Link>
      </div>

      {/* Exam Overview Banner */}
      <Card className="p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              {exam.quarter}-chorak
            </span>
            {exam.isResultsPublished ? (
              <Badge variant="teal">Natijalar ochiq</Badge>
            ) : (
              <Badge variant="secondary">Natijalar yashiringan</Badge>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            {exam.title}
          </h1>
          <p className="text-xs text-slate-500">
            Davomiyligi: {exam.durationMinutes} daqiqa &bull; Savollar: {exam.questions.length} ta &bull;
            O&apos;tish: {exam.passingScore}%
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/mentor/exams/${exam._id}/edit`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Tahrirlash</span>
          </Link>
        </div>
      </Card>

      {/* Submissions Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            <span>Topshirgan o&apos;quvchilar ({submissions.length})</span>
          </h2>
        </div>

        {submissions.length === 0 ? (
          <Card className="p-12 text-center rounded-3xl border-dashed border-slate-200 dark:border-slate-800 space-y-2">
            <FileCheck className="w-8 h-8 text-slate-500 dark:text-slate-400 mx-auto" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Hozircha hech kim topshirmagan
            </h2>
            <p className="text-xs text-slate-500">
              O&apos;quvchilar imtihonni topshirishi bilan ularning javoblari shu yerda ko&apos;rinadi.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-semibold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">O&apos;quvchi</th>
                  <th className="px-4 py-3">Guruh</th>
                  <th className="px-4 py-3">Topshirilgan vaqt</th>
                  <th className="px-4 py-3">Holat</th>
                  <th className="px-4 py-3">Ball</th>
                  <th className="px-4 py-3 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {submissions.map((sub) => {
                  const isGraded = sub.status === "graded";
                  const isNeedsReview = sub.status === "submitted";

                  return (
                    <tr
                      key={sub._id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {sub.studentName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{sub.studentLogin}</div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {sub.groupName}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {sub.submittedAt
                          ? formatDateTimeUz(sub.submittedAt)
                          : "Topshirilmagan"}
                      </td>
                      <td className="px-4 py-3.5">
                        {isGraded ? (
                          <Badge variant={sub.isPassed ? "teal" : "rose"} className="text-xs">
                            {sub.isPassed ? "O'tdi" : "Yetmadi"}
                          </Badge>
                        ) : isNeedsReview ? (
                          <Badge variant="amber" className="text-xs flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" />
                            <span>Tekshirish kerak</span>
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Yechmoqda
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-bold font-mono text-slate-900 dark:text-slate-100">
                        {sub.totalScore} / {sub.maxScore}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/mentor/exams/${exam._id}/submissions/${sub._id}`}
                          className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 text-xs" })}
                        >
                          <span>Baholash</span>
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
