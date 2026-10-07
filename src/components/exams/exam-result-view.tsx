"use client";

import Link from "next/link";
import { IExamData } from "@/lib/db/models/exam.model";
import { IExamSubmissionData } from "@/lib/db/models/exam-submission.model";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Award,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  FileCheck,
  GitBranch,
  MessageSquare,
} from "lucide-react";

interface ExamResultViewProps {
  exam: IExamData;
  submission: IExamSubmissionData;
}

export function ExamResultView({ exam, submission }: ExamResultViewProps) {
  const percentage = Math.round((submission.totalScore / (submission.maxScore || 1)) * 100);
  const isPending = submission.status !== "graded";
  const isPassed = submission.isPassed;

  return (
    <div className="space-y-4 max-w-4xl mx-auto pb-16 animate-in fade-in">
      {/* Back button */}
      <div>
        <Link
          href="/exams"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Imtihonlar ro&apos;yxatiga qaytish
        </Link>
      </div>

      {/* Score Banner */}
      <Card
        className={`p-6 sm:p-8 rounded-3xl border shadow-sm text-center space-y-4 ${
          isPending
            ? "border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/20"
            : isPassed
            ? "border-teal-500/40 bg-teal-500/5 dark:bg-teal-950/20"
            : "border-rose-500/40 bg-rose-500/5 dark:bg-rose-950/20"
        }`}
      >
        <div className="inline-flex p-4 rounded-3xl bg-white dark:bg-slate-800 shadow-xs">
          <Award
            className={`w-12 h-12 ${
              isPending
                ? "text-amber-500"
                : isPassed
                ? "text-teal-600 dark:text-teal-400"
                : "text-rose-500"
            }`}
          />
        </div>

        <div className="space-y-1">
          <Badge
            variant={isPending ? "amber" : isPassed ? "teal" : "rose"}
            className="text-xs px-3 py-1 font-semibold"
          >
            {isPending
              ? "Mentor tekshirmoqda — ball hali yakuniy emas"
              : isPassed
              ? "Imtihondan o'tdingiz!"
              : "O'tish baliga yetmadi"}
          </Badge>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100">
            {exam.title}
          </h1>
        </div>

        <div className="flex items-center justify-center gap-6 pt-2">
          <div>
            <span className="text-xs text-slate-500 block uppercase font-bold tracking-wider">
              To&apos;plangan ball
            </span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {submission.totalScore} / {submission.maxScore}
            </span>
          </div>
          <div className="w-px h-10 bg-slate-200 dark:bg-slate-700" />
          <div>
            <span className="text-xs text-slate-500 block uppercase font-bold tracking-wider">
              Foiz ko&apos;rsatkichi
            </span>
            <span className="text-2xl sm:text-3xl font-black text-teal-600 dark:text-teal-400 font-mono">
              {percentage}%
            </span>
          </div>
        </div>

        {submission.mentorGeneralFeedback && (
          <div className="max-w-lg mx-auto p-4 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 text-left space-y-1">
            <span className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Mentor umumiy fikri:
            </span>
            <p className="whitespace-pre-line">{submission.mentorGeneralFeedback}</p>
          </div>
        )}
      </Card>

      {/* Detailed Question Review */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Savollar tahlili va xatolar
        </h2>

        {exam.questions.map((q, idx) => {
          const qId = q._id?.toString() || "";
          const studentAns = submission.answers.find((a) => a.questionId === qId);
          const isFullPoints = (studentAns?.pointsAwarded || 0) === q.points;

          return (
            <Card
              key={qId}
              className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-xs space-y-4"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    {idx + 1}-savol &bull; Ball: {studentAns?.pointsAwarded || 0} / {q.points}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 pt-1 whitespace-pre-wrap">
                    {q.prompt}
                  </h3>
                </div>

                <div>
                  {isFullPoints ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                      <CheckCircle2 className="w-3.5 h-3.5" /> To&apos;g&apos;ri
                    </span>
                  ) : (studentAns?.pointsAwarded || 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                      Qisman to&apos;g&apos;ri
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg">
                      <XCircle className="w-3.5 h-3.5" /> Noto&apos;g&apos;ri
                    </span>
                  )}
                </div>
              </div>

              {/* Answers preview */}
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
                    Sizning javobingiz:
                  </span>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 mt-1">
                    {studentAns?.value ? (
                      Array.isArray(studentAns.value) ? (
                        studentAns.value.join(", ")
                      ) : (
                        studentAns.value
                      )
                    ) : studentAns?.fileName ? (
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-teal-600" />
                        <span>{studentAns.fileName}</span>
                      </div>
                    ) : studentAns?.repoUrl ? (
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-slate-600" />
                        <span>{studentAns.repoUrl}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400 italic">Javob berilmagan</span>
                    )}
                  </div>
                </div>

                {q.correctAnswers && q.correctAnswers.length > 0 && (
                  <div>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 block">
                      To&apos;g&apos;ri javob:
                    </span>
                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 mt-1 font-medium">
                      {q.correctAnswers.join(", ")}
                    </div>
                  </div>
                )}

                {/* Mentor comment */}
                {studentAns?.mentorFeedback && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                    <span className="font-bold">Mentor izohi:</span>
                    <p>{studentAns.mentorFeedback}</p>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
