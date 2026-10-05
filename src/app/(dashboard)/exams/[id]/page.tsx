import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/guards";
import { getExamForStudent } from "@/actions/exam.actions";
import { ExamTaker } from "@/components/exams/exam-taker";
import { ExamStartCard } from "@/components/exams/exam-start-card";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Lock, ArrowLeft, CheckCircle2 } from "lucide-react";

interface ExamDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ExamDetailPage({ params }: ExamDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await params;
  const res = await getExamForStudent(resolvedParams.id);

  if (!res.success || !res.data) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <Card className="p-6 rounded-2xl space-y-4">
          <p className="text-rose-600 font-semibold">{res.error || "Imtihon topilmadi"}</p>
          <Link
            href="/exams"
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Imtihonlarga qaytish
          </Link>
        </Card>
      </div>
    );
  }

  const { exam, submission, isLocked, lockReason, canRetake, serverTime } = res.data;

  // Agar imtihon vaqti kelmagan bo'lsa yoki yopilgan bo'lsa
  if (isLocked) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <Card className="p-8 rounded-3xl space-y-4 border-slate-200/80 dark:border-slate-800/80">
          <div className="inline-flex p-4 rounded-3xl bg-amber-500/10 text-amber-600">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Imtihon yopiq
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {lockReason || "Imtihonga ayni paytda kirish mumkin emas"}
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

  // Agar o'quvchi topshirib bo'lgan bo'lsa
  if (
    submission &&
    (submission.status === "submitted" || submission.status === "graded") &&
    !canRetake
  ) {
    if (exam.isResultsPublished) {
      redirect(`/exams/${resolvedParams.id}/result`);
    }

    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <Card className="p-8 rounded-3xl space-y-4 border-slate-200/80 dark:border-slate-800/80">
          <div className="inline-flex p-4 rounded-3xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Imtihon topshirilgan!
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Siz ushbu imtihonni topshirdingiz. Natijalar mentor tomonidan e&apos;lon qilingach,
            xatolar va ballar bilan tanishishingiz mumkin.
          </p>
          <Link
            href="/exams"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Bosh sahifaga qaytish
          </Link>
        </Card>
      </div>
    );
  }

  // Agar urinish allaqachon boshlangan bo'lsa (in_progress)
  if (submission && submission.status === "in_progress") {
    // Muddat: boshlangan vaqt + davomiylik, lekin imtihon oynasi yopilishidan kech emas
    const deadline = new Date(
      Math.min(
        new Date(submission.startedAt).getTime() + exam.durationMinutes * 60 * 1000,
        new Date(exam.endTime).getTime()
      )
    ).toISOString();

    return (
      <ExamTaker
        key={submission._id.toString()}
        exam={exam}
        initialSubmission={submission}
        deadline={deadline}
        serverTime={serverTime}
        durationMinutes={exam.durationMinutes}
      />
    );
  }

  // Agar hali boshlamagan bo'lsa, start ekranini ko'rsatamiz
  return <ExamStartCard exam={exam} />;
}
