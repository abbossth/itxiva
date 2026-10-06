"use client";

import Link from "next/link";
import { IExamData } from "@/lib/db/models/exam.model";
import { IExamSubmissionData } from "@/lib/db/models/exam-submission.model";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Calendar,
  Clock,
  Award,
  ArrowRight,
  FileText,
} from "lucide-react";
import { formatDateTimeUz } from "@/lib/utils";

interface ExamCardProps {
  exam: IExamData;
  submission: IExamSubmissionData | null;
  category: "active" | "upcoming" | "past";
}

export function ExamCard({ exam, submission, category }: ExamCardProps) {
  const isCompleted = submission && (submission.status === "submitted" || submission.status === "graded");
  const isInProgress = submission && submission.status === "in_progress";
  // Ball faqat mentor natijalarni e'lon qilgach va baholash tugagach ko'rsatiladi
  const showScore = submission?.status === "graded" && exam.isResultsPublished;

  return (
    <Card className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs hover:border-teal-500/40 transition-all flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            {exam.quarter}-chorak imtihoni
          </span>

          {category === "active" && !isCompleted && (
            <Badge variant="teal" className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal-500 animate-ping" />
              <span>Faol</span>
            </Badge>
          )}

          {category === "upcoming" && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Kutilmoqda</span>
            </Badge>
          )}

          {isCompleted && (
            <Badge
              variant={showScore ? (submission.isPassed ? "teal" : "rose") : "amber"}
              className="flex items-center gap-1"
            >
              {showScore ? (
                <>
                  <Award className="w-3.5 h-3.5" />
                  <span>
                    {submission.totalScore} / {submission.maxScore} ball
                  </span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5" />
                  <span>{exam.isResultsPublished ? "Tekshirilmoqda" : "Topshirildi"}</span>
                </>
              )}
            </Badge>
          )}
        </div>

        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
            {exam.title}
          </h2>
          {exam.description && (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              {exam.description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>Davomiyligi: {exam.durationMinutes} daq</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>O&apos;tish bali: {exam.passingScore}%</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>
              Muddat: {formatDateTimeUz(exam.startTime)} —{" "}
              {formatDateTimeUz(exam.endTime)}
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2">
        {category === "active" && !isCompleted && (
          <Link
            href={`/exams/${exam._id}`}
            className={buttonVariants({
              variant: "primary",
              className: "w-full justify-center gap-2 font-semibold",
            })}
          >
            <span>{isInProgress ? "Davom ettirish" : "Imtihonni boshlash"}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}

        {isCompleted && exam.isResultsPublished && (
          <Link
            href={`/exams/${exam._id}/result`}
            className={buttonVariants({
              variant: "outline",
              className: "w-full justify-center gap-2 border-teal-500/30 text-teal-600 dark:text-teal-400",
            })}
          >
            <FileText className="w-4 h-4" />
            <span>Natijalarni ko&apos;rish</span>
          </Link>
        )}

        {isCompleted && !exam.isResultsPublished && (
          <div className="text-center text-xs text-slate-500 dark:text-slate-400 py-2">
            Natijalar tez orada mentor tomonidan e&apos;lon qilinadi
          </div>
        )}

        {category === "upcoming" && (
          <div className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-2 bg-slate-50 dark:bg-slate-900/40 rounded-xl">
            Boshlanish: {formatDateTimeUz(exam.startTime)}
          </div>
        )}
      </div>
    </Card>
  );
}
