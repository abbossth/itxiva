import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { getExamsForStudent } from "@/actions/exam.actions";
import { ExamsListClient } from "@/components/exams/exams-list-client";
import { GraduationCap } from "lucide-react";

export const metadata = {
  title: "Imtihonlar — ITXiva",
  description: "O'quvchilar uchun choraklik va oraliq imtihonlar ro'yxati",
};

export default async function StudentExamsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role === "mentor") {
    redirect("/mentor/exams");
  }

  const res = await getExamsForStudent();
  const data = res.data || { active: [], upcoming: [], past: [] };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <GraduationCap className="w-6 h-6" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Imtihonlar
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choraklik nazorat ishlari, testlar va amaliy topshiriqlar
          </p>
        </div>
      </div>

      <ExamsListClient
        active={data.active}
        upcoming={data.upcoming}
        past={data.past}
      />
    </div>
  );
}
