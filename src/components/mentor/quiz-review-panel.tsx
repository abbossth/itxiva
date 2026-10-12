"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AiGradeButton } from "@/components/mentor/ai-grade-button";
import { gradeQuizSubmissionAction, QuizReviewItem } from "@/actions/quiz.actions";
import { cn } from "@/lib/utils";

const card = "rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface";

function ReviewRow({ item, defaultOpen }: { item: QuizReviewItem; defaultOpen: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [grades, setGrades] = useState(() =>
    Object.fromEntries(item.answers.map((a) => [a.questionId, { points: a.pointsAwarded, feedback: a.feedback }]))
  );
  const [isSaving, setIsSaving] = useState(false);
  const pending = item.status === "submitted";
  const aiCount = item.answers.filter((a) => a.aiGraded).length;

  const save = async () => {
    try {
      setIsSaving(true);
      const res = await gradeQuizSubmissionAction({
        submissionId: item.submissionId,
        grades: item.answers.map((a) => ({
          questionId: a.questionId,
          pointsAwarded: grades[a.questionId].points,
          mentorFeedback: grades[a.questionId].feedback,
        })),
      });
      if (res.success) {
        toast.success(res.message || "Baho saqlandi");
        router.refresh();
      } else {
        toast.error(res.error || "Saqlab bo'lmadi");
      }
    } catch {
      toast.error("Saqlab bo'lmadi");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 sm:p-4 text-left cursor-pointer min-h-[52px]"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900 dark:text-slate-100 break-words">{item.studentName}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {item.totalScore} / {item.maxScore} ball
          </span>
        </span>
        {pending ? <Badge variant="warning">Tekshirish kerak</Badge> : aiCount > 0 ? <Badge variant="teal">AI baholadi</Badge> : <Badge variant="secondary">Baholangan</Badge>}
        <ChevronDown className={cn("w-4 h-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 px-3 pb-4 sm:px-4">
          {item.answers.map((a) => (
            <div key={a.questionId} className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-pre-wrap break-words">{a.prompt}</p>
              {a.sample && (
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Namunaviy javob: </span>
                  {a.sample}
                </p>
              )}
              <div className="rounded-lg bg-white dark:bg-slate-800 p-2.5 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                {a.value || <span className="italic text-slate-500 dark:text-slate-400">Javob berilmagan</span>}
              </div>
              {a.aiGraded && (
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                  <Bot className="w-3.5 h-3.5" />
                  Ball va izohni AI qo&apos;ygan
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Ball:
                  <input
                    type="number"
                    min={0}
                    max={a.maxPoints}
                    value={grades[a.questionId].points}
                    onChange={(e) =>
                      setGrades((g) => ({
                        ...g,
                        [a.questionId]: { ...g[a.questionId], points: Math.min(a.maxPoints, Math.max(0, Number(e.target.value) || 0)) },
                      }))
                    }
                    className="w-16 h-9 px-2 text-center font-bold text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  / {a.maxPoints}
                </label>
                <input
                  type="text"
                  value={grades[a.questionId].feedback}
                  onChange={(e) => setGrades((g) => ({ ...g, [a.questionId]: { ...g[a.questionId], feedback: e.target.value } }))}
                  placeholder="Izoh (o'quvchiga ko'rinadi)"
                  aria-label="Izoh"
                  className="min-w-0 flex-1 basis-48 h-9 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          ))}
          <Button variant="primary" size="sm" onClick={save} isLoading={isSaving}>
            {pending ? "Bahoni saqlash" : "O'zgarishni saqlash"}
          </Button>
        </div>
      )}
    </li>
  );
}

/** Dars testidagi ochiq javoblar: mentor tekshiradiganlari va AI baholaganlari */
export function QuizReviewPanel({ lessonId, items }: { lessonId: string; items: QuizReviewItem[] }) {
  if (items.length === 0) return null;
  const pending = items.filter((i) => i.status === "submitted");
  // AI qayta urinishi mumkin bo'lganlar: avtomatik savolga yozilgan, lekin hali baholanmagan javob
  const retryable = pending.filter((i) => i.answers.some((a) => a.auto && !a.aiGraded && a.value.trim())).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Testdagi ochiq javoblar</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {pending.length > 0 ? `${pending.length} ta topshiriq sizning bahoyingizni kutmoqda` : "Hammasi baholangan — xohlasangiz bahoni o'zgartira olasiz"}
          </p>
        </div>
        {retryable > 0 && <AiGradeButton kind="quiz" id={lessonId} pending={retryable} />}
      </div>
      <ul className={cn(card, "divide-y divide-slate-100 dark:divide-slate-800")}>
        {items.map((item) => (
          <ReviewRow key={`${item.submissionId}-${item.status}-${item.totalScore}`} item={item} defaultOpen={item.status === "submitted" && pending.length <= 3} />
        ))}
      </ul>
    </section>
  );
}
