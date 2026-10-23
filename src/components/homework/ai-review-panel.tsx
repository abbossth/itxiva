"use client";

import { useState } from "react";
import Link from "@/components/ui/link";
import {
  Sparkles,
  RefreshCw,
  X,
  CheckCircle2,
  XCircle,
  CircleDot,
  CircleDashed,
  HelpCircle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { suggestHomeworkReviewAction, type HomeworkReviewResult } from "@/actions/ai.actions";
import type { CheckVerdict, HomeworkReview, Likelihood } from "@/lib/ai/review-homework";
import { cn } from "@/lib/utils";

// Bir javob qayta ochilganda AI'ni yana chaqirmaslik uchun: kalit — javob va urinish raqami
const cache = new Map<string, HomeworkReviewResult>();

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

const LIKELIHOOD: Record<Likelihood, { label: string; variant: "success" | "warning" | "danger" }> = {
  low: { label: "past", variant: "success" },
  medium: { label: "o'rtacha", variant: "warning" },
  high: { label: "yuqori", variant: "danger" },
};

// Matn 70% va undan ko'p mos kelsa, AI nima desa ham ko'chirish ehtimoli kamida "o'rtacha" deb ko'rsatiladi
const STRONG_SIMILARITY = 70;

function copyLevel(review: HomeworkReviewResult): Likelihood {
  const top = review.similar[0]?.percent ?? 0;
  if (top >= STRONG_SIMILARITY && review.originality.copyLikelihood === "low") return "medium";
  return review.originality.copyLikelihood;
}

const sectionTitle = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1";

function OriginalitySection({ review }: { review: HomeworkReviewResult }) {
  const o = review.originality;
  const copy = LIKELIHOOD[copyLevel(review)];
  const ai = LIKELIHOOD[o.aiLikelihood];
  return (
    <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 p-2.5 space-y-2.5">
      <div className={sectionTitle}>Mustaqil bajarganmi (faqat sizga)</div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900 dark:text-slate-100">Boshqa o&apos;quvchidan ko&apos;chirish:</span>
          <Badge variant={copy.variant}>{copy.label}</Badge>
        </div>
        {review.similar.length > 0 ? (
          <ul className="text-sm space-y-0.5">
            {review.similar.map((s) => (
              <li key={`${s.lessonId}-${s.studentId}`} className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  href={`/mentor/homework/${s.lessonId}?student=${s.studentId}`}
                  target="_blank"
                  className="font-medium text-teal-700 dark:text-teal-400 hover:underline"
                >
                  {s.fullName}
                </Link>
                {s.groupName && <span className="text-xs text-slate-500 dark:text-slate-400">{s.groupName}</span>}
                <span
                  className={cn(
                    "font-mono text-xs font-bold tabular-nums",
                    s.percent >= STRONG_SIMILARITY ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {s.percent}% o&apos;xshash
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">Boshqa javoblar orasida o&apos;xshash matn topilmadi.</p>
        )}
        {o.copySignals.length > 0 && (
          <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc pl-5 space-y-0.5">
            {o.copySignals.map((sig, i) => (
              <li key={i} className="break-words">{sig}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900 dark:text-slate-100">AI yordamida yozilgan bo&apos;lishi:</span>
          <Badge variant={ai.variant}>{ai.label}</Badge>
        </div>
        {o.aiSignals.length > 0 && (
          <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc pl-5 space-y-0.5">
            {o.aiSignals.map((sig, i) => (
              <li key={i} className="break-words">{sig}</li>
            ))}
          </ul>
        )}
      </div>

      {o.verifyQuestions.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">O&apos;quvchidan og&apos;zaki so&apos;rang:</div>
          <ul className="text-sm text-slate-700 dark:text-slate-300 list-decimal pl-5 space-y-0.5">
            {o.verifyQuestions.map((q, i) => (
              <li key={i} className="break-words">{q}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Bu taxmin, dalil emas: AI yozganini hech bir dastur aniq aniqlay olmaydi. Shubha bo&apos;lsa, o&apos;quvchidan yechimini
        tushuntirib berishni so&apos;rang.
      </p>
    </div>
  );
}

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
  const [review, setReview] = useState<HomeworkReviewResult | null>(() => cache.get(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  // fresh — "Qaytadan tekshirish": saqlangan natija emas, AI'dan yangisi so'raladi
  const run = async (fresh = false) => {
    try {
      setLoading(true);
      setError(null);
      setHidden(false);
      const res = await suggestHomeworkReviewAction(submissionId, { fresh });
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
          onClick={() => void run()}
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
  const suspicious = copyLevel(review) !== "low" || review.originality.aiLikelihood !== "low";
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
        {suspicious ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
            <ShieldAlert className="w-4 h-4" />
            mustaqilligi shubhali
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            shubha yo&apos;q
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => void run(true)}
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

      <OriginalitySection review={review} />

      <div>
        <div className={sectionTitle}>
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
