import { requireMentorPage } from "@/lib/auth/guards";
import { getExamsForMentor } from "@/actions/exam.actions";
import { ExamsManager } from "@/components/mentor/exams-manager";
import { GraduationCap } from "lucide-react";

export const metadata = {
  title: "Imtihonlar boshqaruvi — ITXiva",
  description: "Mentor uchun imtihonlarni yaratish, tahrirlash va baholash",
};

export default async function MentorExamsPage() {
  await requireMentorPage();
  const res = await getExamsForMentor();
  const exams = res.data || [];

  return (
    <div className="space-y-4 max-w-5xl mx-auto animate-in fade-in pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <GraduationCap className="w-6 h-6" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Imtihonlar boshqaruvi
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Guruhlar uchun oraliq va choraklik imtihonlarni rejalashtirish va baholash
          </p>
        </div>
      </div>

      <ExamsManager initialExams={exams} />
    </div>
  );
}
