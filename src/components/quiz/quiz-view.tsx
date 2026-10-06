"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IQuizData } from "@/lib/db/models/quiz.model";
import { IQuizSubmissionData, QuizSubmissionStatus } from "@/lib/db/models/quiz-submission.model";
import { submitQuizAction } from "@/actions/quiz.actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, CheckCircle2, XCircle, Clock, Award, Sparkles } from "lucide-react";

interface QuizViewProps {
  lessonId: string;
  quiz: IQuizData;
  initialSubmission: IQuizSubmissionData | null;
  role: "student" | "mentor";
}

export function QuizView({ quiz, initialSubmission, role }: QuizViewProps) {
  const router = useRouter();
  const [submission, setSubmission] = useState<IQuizSubmissionData | null>(initialSubmission);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(() => {
    if (initialSubmission?.answers) {
      const map: Record<string, string | string[]> = {};
      initialSubmission.answers.forEach((a) => {
        map[a.questionId] = a.value;
      });
      return map;
    }
    return {};
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCompleted = submission && (submission.status === "graded" || submission.status === "submitted");

  const handleSingleSelect = (questionId: string, option: string) => {
    if (isCompleted && role === "student") return;
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
  };

  const handleMultipleSelect = (questionId: string, option: string) => {
    if (isCompleted && role === "student") return;
    const current = Array.isArray(answers[questionId])
      ? (answers[questionId] as string[])
      : [];
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
  };

  const handleTextChange = (questionId: string, value: string) => {
    if (isCompleted && role === "student") return;
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const formattedAnswers = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      }));

      const res = await submitQuizAction({
        quizId: quiz._id,
        answers: formattedAnswers,
      });

      if (!res.success) {
        setError(res.error || "Xatolik yuz berdi");
      } else if (res.data) {
        setSubmission({
          _id: "temp",
          quizId: quiz._id,
          lessonId: quiz.lessonId,
          studentId: "me",
          answers: res.data.answers,
          totalScore: res.data.totalScore,
          maxScore: res.data.maxScore,
          status: res.data.status as QuizSubmissionStatus,
          submittedAt: new Date().toISOString(),
        });
        // To'g'ri javoblar va tushuntirishlarni serverdan qayta yuklash
        router.refresh();
      }
    } catch {
      setError("Server bilan aloqada xatolik");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-5 md:p-6 rounded-2xl border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <HelpCircle className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {quiz.title}
            </h2>
          </div>
          {quiz.description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {quiz.description}
            </p>
          )}
        </div>

        {submission && (
          <div className="flex items-center gap-2">
            {submission.status === "graded" ? (
              <Badge variant="teal" className="flex items-center gap-1.5 px-3 py-1">
                <Award className="w-4 h-4" />
                <span>
                  Ball: {submission.totalScore} / {submission.maxScore}
                </span>
              </Badge>
            ) : (
              <Badge variant="amber" className="flex items-center gap-1.5 px-3 py-1">
                <Clock className="w-4 h-4" />
                <span>Tekshirilmoqda</span>
              </Badge>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 text-sm rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {quiz.questions.map((q, idx) => {
          const qId = q._id ? q._id.toString() : "";
          const studentAns = answers[qId];
          const subAns = submission?.answers.find((a) => a.questionId === qId);

          return (
            <div
              key={qId || idx}
              className="p-4 md:p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {idx + 1}-savol ({q.points} ball)
                  </span>
                  <p className="text-base font-medium text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                    {q.prompt}
                  </p>
                </div>

                {subAns && submission?.status === "graded" && (
                  <div>
                    {subAns.isCorrect ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5" /> To&apos;g&apos;ri
                      </span>
                    ) : subAns.isCorrect === false ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg">
                        <XCircle className="w-3.5 h-3.5" /> Noto&apos;g&apos;ri
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                        <Clock className="w-3.5 h-3.5" /> Ochiq savol
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Savol turi bo'yicha render */}
              {q.type === "single_choice" && (
                <div className="space-y-2 pt-1">
                  {q.options?.map((opt, oIdx) => {
                    const isSelected = studentAns === opt;
                    return (
                      <button
                        type="button"
                        key={oIdx}
                        disabled={!!isCompleted && role === "student"}
                        onClick={() => handleSingleSelect(qId, opt)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all text-sm flex items-center gap-3 min-h-[48px] select-none ${
                          isSelected
                            ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 font-semibold"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "border-teal-500 bg-teal-500 text-white"
                              : "border-slate-400"
                          }`}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "multiple_choice" && (
                <div className="space-y-2 pt-1">
                  {q.options?.map((opt, oIdx) => {
                    const selectedArray = Array.isArray(studentAns) ? studentAns : [];
                    const isSelected = selectedArray.includes(opt);
                    return (
                      <button
                        type="button"
                        key={oIdx}
                        disabled={!!isCompleted && role === "student"}
                        onClick={() => handleMultipleSelect(qId, opt)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all text-sm flex items-center gap-3 min-h-[48px] select-none ${
                          isSelected
                            ? "border-teal-500 bg-teal-500/10 text-teal-900 dark:text-teal-200 font-semibold"
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "border-teal-500 bg-teal-500 text-white"
                              : "border-slate-400"
                          }`}
                        >
                          {isSelected && <span className="w-2 h-1 border-l-2 border-b-2 border-white -rotate-45" />}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === "short_answer" && (
                <div className="pt-1">
                  <input
                    type="text"
                    disabled={!!isCompleted && role === "student"}
                    value={typeof studentAns === "string" ? studentAns : ""}
                    onChange={(e) => handleTextChange(qId, e.target.value)}
                    placeholder="Qisqa javobni yozing..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              )}

              {q.type === "open_ended" && (
                <div className="pt-1">
                  <textarea
                    rows={3}
                    disabled={!!isCompleted && role === "student"}
                    value={typeof studentAns === "string" ? studentAns : ""}
                    onChange={(e) => handleTextChange(qId, e.target.value)}
                    placeholder="Batafsil javobingizni yozing..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500 resize-none"
                  />
                </div>
              )}

              {/* Izoh yoki mentor fikri */}
              {subAns?.mentorFeedback && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <span className="font-semibold">Mentor fikri:</span>
                  <p>{subAns.mentorFeedback}</p>
                </div>
              )}

              {q.explanation && submission?.status === "graded" && (
                <div className="p-3 rounded-xl bg-teal-500/10 text-xs text-teal-800 dark:text-teal-300">
                  <span className="font-semibold">Tushuntirish:</span> {q.explanation}
                </div>
              )}
            </div>
          );
        })}

        {!isCompleted && role === "student" && (
          <Button
            type="submit"
            isLoading={submitting}
            className="w-full md:w-auto px-8 py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Testni topshirish</span>
          </Button>
        )}
      </form>
    </Card>
  );
}
