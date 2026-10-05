import Link from "next/link";
import { requireMentor } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { ExamEditorForm } from "@/components/mentor/exam-editor-form";
import { ArrowLeft, GraduationCap } from "lucide-react";

export const metadata = {
  title: "Yangi imtihon yaratish — ITXiva",
};

export default async function NewExamPage() {
  await requireMentor();
  const groups = await getGroups();

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
          <GraduationCap className="w-6 h-6" />
        </span>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Yangi imtihon yaratish
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Choraklik nazorat ishi parametrlarini va savollarini shakllantiring
          </p>
        </div>
      </div>

      <ExamEditorForm groups={groups} />
    </div>
  );
}
