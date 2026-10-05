"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IExamData } from "@/lib/db/models/exam.model";
import { IExamSubmissionData } from "@/lib/db/models/exam-submission.model";
import { gradeExamSubmissionAction } from "@/actions/exam.actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Download,
  GitBranch,
  Sparkles,
  FileText,
  User,
} from "lucide-react";
import { formatDateTimeUz } from "@/lib/utils";

interface ExamGradingViewProps {
  submission: IExamSubmissionData;
  studentName: string;
  studentLogin: string;
  groupName: string;
  exam: IExamData;
  fileDownloadUrls: Record<string, string>;
}

export function ExamGradingView({
  submission,
  studentName,
  studentLogin,
  groupName,
  exam,
  fileDownloadUrls,
}: ExamGradingViewProps) {
  const router = useRouter();

  // Map of question grades: points and feedback
  const [grades, setGrades] = useState<
    Record<string, { pointsAwarded: number; mentorFeedback: string }>
  >(() => {
    const map: Record<string, { pointsAwarded: number; mentorFeedback: string }> = {};
    submission.answers.forEach((ans) => {
      map[ans.questionId] = {
        pointsAwarded: ans.pointsAwarded || 0,
        mentorFeedback: ans.mentorFeedback || "",
      };
    });
    return map;
  });

  const [mentorGeneralFeedback, setMentorGeneralFeedback] = useState(
    submission.mentorGeneralFeedback || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateGrade = (questionId: string, points: number) => {
    setGrades((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        pointsAwarded: points,
      },
    }));
  };

  const updateFeedback = (questionId: string, feedback: string) => {
    setGrades((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        mentorFeedback: feedback,
      },
    }));
  };

  const calculatedTotalScore = Object.values(grades).reduce(
    (sum, g) => sum + (Number(g.pointsAwarded) || 0),
    0
  );

  const totalMaxScore = exam.questions.reduce((sum, q) => sum + q.points, 0);

  const handleSaveGrades = async () => {
    setError(null);
    setSaving(true);

    try {
      const gradesList = Object.entries(grades).map(([questionId, g]) => ({
        questionId,
        pointsAwarded: g.pointsAwarded,
        mentorFeedback: g.mentorFeedback,
      }));

      const res = await gradeExamSubmissionAction({
        submissionId: submission._id,
        grades: gradesList,
        mentorGeneralFeedback,
      });

      if (!res.success) {
        setError(res.error || "Baholashda xatolik yuz berdi");
        setSaving(false);
      } else {
        router.push(`/mentor/exams/${exam._id}`);
        router.refresh();
      }
    } catch {
      setError("Server bilan aloqada xatolik yuz berdi");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-in fade-in">
      {/* Header */}
      <div>
        <Link
          href={`/mentor/exams/${exam._id}`}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Imtihon topshiriqlariga qaytish
        </Link>
      </div>

      {/* Student Banner */}
      <Card className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {studentName} ({studentLogin})
            </h2>
            <p className="text-xs text-slate-500">
              {groupName} &bull; {submission.attemptNumber}-urinish &bull; Topshirilgan:{" "}
              {submission.submittedAt
                ? formatDateTimeUz(submission.submittedAt)
                : "Topshirilmagan"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-xs text-slate-400 uppercase font-bold tracking-wider block">
              Hisoblangan ball
            </span>
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
              {calculatedTotalScore} / {totalMaxScore}
            </span>
          </div>

          <Button
            onClick={handleSaveGrades}
            isLoading={saving}
            variant="primary"
            className="gap-2 font-semibold"
          >
            <Sparkles className="w-4 h-4" />
            <span>Bahoni saqlash</span>
          </Button>
        </div>
      </Card>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Questions Grading */}
      <div className="space-y-5">
        {exam.questions.map((q, idx) => {
          const qId = q._id?.toString() || "";
          const ans = submission.answers.find((a) => a.questionId === qId);
          const currentGrade = grades[qId] || { pointsAwarded: 0, mentorFeedback: "" };
          const downloadUrl = fileDownloadUrls[qId];

          const isAutoGraded = q.type === "single_choice" || q.type === "multiple_choice";

          return (
            <Card
              key={qId}
              className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] shadow-xs space-y-4"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    {idx + 1}-savol &bull; Maksimal ball: {q.points}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 pt-1 whitespace-pre-wrap">
                    {q.prompt}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Berilgan ball:</span>
                  <input
                    type="number"
                    min={0}
                    max={q.points}
                    value={currentGrade.pointsAwarded}
                    onChange={(e) => updateGrade(qId, Number(e.target.value) || 0)}
                    className="w-16 px-2 py-1 text-center font-bold text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-xs text-slate-400">/ {q.points}</span>
                </div>
              </div>

              {/* Student's answer display */}
              <div className="space-y-3">
                <div>
                  <span className="text-xs font-semibold text-slate-400 block">
                    O&apos;quvchi javobi:
                  </span>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 mt-1 text-sm">
                    {ans?.value ? (
                      Array.isArray(ans.value) ? (
                        ans.value.join(", ")
                      ) : (
                        <p className="whitespace-pre-wrap">{ans.value}</p>
                      )
                    ) : ans?.fileName ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-teal-600" />
                          <span className="font-semibold">{ans.fileName}</span>
                          <span className="text-xs text-slate-400">
                            ({Math.round((ans.fileSize || 0) / 1024)} KB)
                          </span>
                        </div>
                        {downloadUrl && (
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-500 text-white hover:bg-teal-600 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Yuklab olish</span>
                          </a>
                        )}
                      </div>
                    ) : ans?.repoUrl ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4" />
                          <span>{ans.repoUrl}</span>
                        </div>
                        <a
                          href={ans.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 font-semibold hover:underline"
                        >
                          GitHub-da ochish &rarr;
                        </a>
                      </div>
                    ) : (
                      <span className="italic text-slate-400">Javob berilmagan</span>
                    )}
                  </div>
                </div>

                {isAutoGraded && q.correctAnswers && (
                  <div className="text-xs">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      To&apos;g&apos;ri javob:{" "}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {q.correctAnswers.join(", ")}
                    </span>
                  </div>
                )}

                {/* Mentor feedback input */}
                <div className="pt-1">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">
                    Ushbu savol uchun izoh (o&apos;quvchiga ko&apos;rinadi):
                  </label>
                  <input
                    type="text"
                    value={currentGrade.mentorFeedback}
                    onChange={(e) => updateFeedback(qId, e.target.value)}
                    placeholder="Masalan: Yaxshi yondashuv, lekin chekka holat hisobga olinmagan"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </Card>
          );
        })}

        {/* General Feedback Card */}
        <Card className="p-5 sm:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] shadow-xs space-y-3">
          <label className="text-sm font-bold text-slate-900 dark:text-slate-100 block">
            Umumiy xulosa va tavsiyalar
          </label>
          <textarea
            rows={3}
            value={mentorGeneralFeedback}
            onChange={(e) => setMentorGeneralFeedback(e.target.value)}
            placeholder="O'quvchining butun imtihon bo'yicha ishlashi haqida umumiy fikringiz..."
            className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-none"
          />
        </Card>

        {/* Submit */}
        <div className="flex justify-end pt-2">
          <Button
            onClick={handleSaveGrades}
            isLoading={saving}
            variant="primary"
            size="lg"
            className="gap-2 font-semibold"
          >
            <Sparkles className="w-4 h-4" />
            <span>Baholashni tasdiqlash ({calculatedTotalScore} / {totalMaxScore})</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
