import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/guards";
import { getExamResultForStudent } from "@/actions/exam.actions";
import { ExamResultView } from "@/components/exams/exam-result-view";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Clock } from "lucide-react";

export const metadata = {
  title: "Imtihon natijasi — ITXiva",
};

interface ExamResultPageProps {
  params: Promise<{ id: string }>;
}

export default async function ExamResultPage({ params }: ExamResultPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await params;
  const res = await getExamResultForStudent(resolvedParams.id);

  if (!res.success || !res.data) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <Card className="p-8 rounded-3xl border-slate-200/80 dark:border-slate-800/80 space-y-4">
          <div className="inline-flex p-4 rounded-3xl bg-amber-500/10 text-amber-600">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Natijalar kutilmoqda
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {res.error || "Ushbu imtihon natijalari hali mentor tomonidan e'lon qilinmagan."}
          </p>
          <Link
            href="/exams"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Imtihonlarga qaytish
          </Link>
        </Card>
      </div>
    );
  }

  const { exam, submission } = res.data;

  return <ExamResultView exam={exam} submission={submission} />;
}
