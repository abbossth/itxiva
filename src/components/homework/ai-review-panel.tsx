"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, X, CheckCircle2, XCircle, CircleDot, CircleDashed, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { suggestHomeworkReviewAction } from "@/actions/ai.actions";
import type { CheckVerdict, HomeworkReview } from "@/lib/ai/review-homework";
import { cn } from "@/lib/utils";

// Bir javob qayta ochilganda AI'ni yana chaqirmaslik uchun: kalit — javob va urinish raqami
const cache = new Map<string, HomeworkReview>();

const CONFIDENCE: Record<HomeworkReview["confidence"], { label: string; variant: "success" | "warning" | "danger" }> = {
  high: { label: "ishonch yuqori", variant: "success" },
  medium: { label: "ishonch o'rtacha", variant: "warning" },
  low: { label: "ishonch past", variant: "danger" },
};

const VERDICT: Record<CheckVerdict, { icon: typeof CheckCircle2; label: string; tone: string }> = {
  correct: { icon: CheckCircle2, label: "to'g'ri", tone: "text-emerald-600 dark:text-emerald-400" },
  partial: { icon: CircleDot, label: "qisman", tone: "text-amber-600 dark:text-amber-400" },
  wrong: { icon: XCircle, label: "xato", tone: "text-rose-600 dark:text-rose-400" },
  missing: { icon: CircleDashed, label: "bajarilmagan", tone: "text-slate-500 dark:text-slate-400" },
  unchecked: { icon: HelpCircle, label: "tekshirilmadi", tone: "text-sky-600 dark:text-sky-400" },
};

export function AiReviewPanel({
  submissionId,
  attempt,
  onApplyScore,
  onApplyFeedback,
}: {
  submissionId: string;
  attempt: number;
  onApplyScore: (score: number) => void;
  onApplyFeedback: (feedback: string) => void;
}) {
  const cacheKey = `${submissionId}-${attempt}`;
  const [review, setReview] = useState<HomeworkReview | null>(() => cache.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  const run = async () => {
    try {
      setLoading(true);
      setError(null);
      setHidden(false);
      const res = await suggestHomeworkReviewAction(submissionId);
      if (res.success && res.data) {
        cache.set(cacheKey, res.data);
        setReview(res.data);
      } else {
        setError(res.message || "AI javob bera olmadi");
      }
    } catch {
      setError("AI javob bera olmadi. Qaytadan urinib ko'ring");
    } finally {
      setLoading(false);
    }
  };

  if (!review || hidden) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={run}
          isLoading={loading}
          className="gap-1.5 min-h-[36px]"
        >
          {!loading && <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />}
          {loading ? "AI javobni tekshiryapti…" : "AI bilan tekshirish"}
        </Button>
        {error && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  const confidence = CONFIDENCE[review.confidence];
  const mistakes = review.checks.filter((c) => c.verdict !== "correct").length;
  return (
    <section
      aria-label="AI taklifi"
      className="rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50/60 dark:bg-violet-950/20 p-3 space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">AI taklifi:</span>
        <span className="font-mono text-lg font-black tabular-nums text-violet-700 dark:text-violet-300">{review.score}</span>
        <span className="text-xs text-slate-600 dark:text-slate-400">ball</span>
        <Badge variant={confidence.variant}>{confidence.label}</Badge>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={run}
            disabled={loading}
            title="Qaytadan tekshirish"
            aria-label="Qaytadan tekshirish"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/60 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => setHidden(true)}
            title="Yopish"
            aria-label="Yopish"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/60 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {review.checks.length > 0 && (
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
            <span>Tekshiruv (faqat sizga)</span>
            {mistakes > 0 && (
              <span className="normal-case tracking-normal text-rose-600 dark:text-rose-400">{mistakes} ta e&apos;tibor talab qiladi</span>
            )}
          </div>
          <ul className="space-y-1 text-sm max-h-72 overflow-y-auto pr-1">
            {review.checks.map((c, i) => {
              const v = VERDICT[c.verdict];
              const Icon = v.icon;
              const flagged = c.verdict !== "correct";
              return (
                <li key={i} className="flex items-start gap-2">
                  <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", v.tone)} aria-label={v.label} />
                  <span className="min-w-0 break-words">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{c.task}</span>{" "}
                    <span className={flagged ? "text-slate-700 dark:text-slate-300" : "text-slate-500 dark:text-slate-400"}>
                      {c.student || (c.verdict === "missing" ? "javob yo'q" : "")}
                    </span>
                    {(c.verdict === "wrong" || c.verdict === "partial") && c.expected && (
                      <span className="text-emerald-700 dark:text-emerald-400"> → {c.expected}</span>
                    )}
                    {flagged && c.comment && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{c.comment}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
          O&apos;quvchiga izoh (taklif)
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line break-words">{review.feedback}</p>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onApplyScore(review.score);
            onApplyFeedback(review.feedback);
          }}
          className="min-h-[36px]"
        >
          Formaga qo&apos;yish
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onApplyScore(review.score)} className="min-h-[36px]">
          Faqat ball
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onApplyFeedback(review.feedback)} className="min-h-[36px]">
          Faqat izoh
        </Button>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          AI xato qilishi mumkin — saqlashdan oldin tekshiring.
        </span>
      </div>
    </section>
  );
}
