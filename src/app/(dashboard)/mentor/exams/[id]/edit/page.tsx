import { notFound } from "next/navigation";
import Link from "next/link";
import { requireMentor } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { getExamByIdForMentor } from "@/actions/exam.actions";
import { ExamEditorForm } from "@/components/mentor/exam-editor-form";
import { ArrowLeft, Edit } from "lucide-react";

interface EditExamPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Imtihonni tahrirlash — ITXiva",
};

export default async function EditExamPage({ params }: EditExamPageProps) {
  await requireMentor();
  const resolvedParams = await params;

  const [groups, examRes] = await Promise.all([
    getGroups(),
    getExamByIdForMentor(resolvedParams.id),
  ]);

  if (!examRes.success || !examRes.data) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in pb-16">
      <div>
        <Link
          href="/mentor/exams"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Imtihonlar ro&apos;yxatiga qaytish
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <Edit className="w-6 h-6" />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Imtihonni tahrirlash
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {examRes.data.title}
          </p>
        </div>
      </div>

      <ExamEditorForm groups={groups} initialExam={examRes.data} />
    </div>
  );
}
