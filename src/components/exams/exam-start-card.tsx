"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/ui/link";
import { IExamData } from "@/lib/db/models/exam.model";
import { startExamAttemptAction } from "@/actions/exam.actions";
import { Button } from "@/components/ui/button";
import { MAX_EXAM_VIOLATIONS } from "@/lib/exam-proctoring";
import {
  GraduationCap,
  Clock,
  Award,
  Play,
  ArrowLeft,
  FileCheck,
  Maximize,
  Timer,
  Save,
  Send,
  RotateCcw,
  ShieldAlert,
  BellOff,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExamStartCardProps {
  exam: IExamData;
  /** Nechanchi urinish boshlanadi (1 — birinchi) */
  attemptNumber?: number;
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-black tabular-nums text-slate-900 dark:text-slate-100", tone)}>{value}</div>
    </div>
  );
}

function Rule({ icon: Icon, title, text }: { icon: typeof Clock; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        <span className="block text-xs leading-relaxed text-slate-600 dark:text-slate-400">{text}</span>
      </span>
    </li>
  );
}

export function ExamStartCard({ exam, attemptNumber = 1 }: ExamStartCardProps) {
  const isRetake = attemptNumber > 1;
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!agreed) return;
    setError(null);
    setStarting(true);
    // To'liq ekran faqat foydalanuvchi bosgan zahoti so'ralishi mumkin — shuning uchun server javobini kutmasdan
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    try {
      const res = await startExamAttemptAction(exam._id.toString());
      if (!res.success) {
        setError(res.error || "Imtihonni boshlashda xatolik yuz berdi");
        setStarting(false);
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      } else {
        router.refresh();
      }
    } catch {
      setError("Server bilan aloqada xatolik yuz berdi");
      setStarting(false);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-6 space-y-4 animate-in fade-in">
      <Link
        href="/exams"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Imtihonlar ro&apos;yxati
      </Link>

      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface shadow-sm overflow-hidden">
        {/* Sarlavha */}
        <header className="p-5 sm:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <span className="shrink-0 grid place-items-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <GraduationCap className="w-6 h-6 sm:w-7 sm:h-7" />
            </span>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300">
                  {exam.quarter}-chorak imtihoni
                </span>
                {isRetake && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    {attemptNumber}-urinish
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-black leading-tight tracking-tight text-slate-900 dark:text-slate-100 text-balance">
                {exam.title}
              </h1>
              {exam.description && (
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{exam.description}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat icon={Clock} label="Vaqt" value={`${exam.durationMinutes} daqiqa`} />
            <Stat icon={FileCheck} label="Savollar" value={`${exam.questions.length} ta`} />
            <Stat icon={Award} label="O'tish bali" value={`${exam.passingScore}%`} tone="text-amber-600 dark:text-amber-400" />
            <Stat icon={RotateCcw} label="Urinish" value={`${attemptNumber} / ${exam.maxAttempts}`} />
          </div>
        </header>

        <div className="border-t border-slate-100 dark:border-slate-800/80 p-5 sm:p-7 space-y-5">
          {/* Qanday o'tadi */}
          <section aria-labelledby="exam-how" className="space-y-3">
            <h2 id="exam-how" className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Imtihon qanday o&apos;tadi
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              <Rule icon={Timer} title="Taymer serverda" text={`Boshlaganingizdan so'ng ${exam.durationMinutes} daqiqa hisoblanadi.`} />
              <Rule icon={Save} title="Avtomatik saqlash" text="Javoblaringiz har 30 soniyada saqlanib boradi." />
              <Rule icon={Send} title="Avtomatik topshirish" text="Vaqt tugasa, ishingiz o'zi topshiriladi." />
              <Rule
                icon={RotateCcw}
                title={`${exam.maxAttempts} ta urinish`}
                text={
                  exam.maxAttempts > 1
                    ? "Asosiy natija — oxirgi topshirilgan urinish."
                    : "Bu imtihonni faqat bir marta topshirasiz."
                }
              />
            </ul>
          </section>

          {/* To'liq ekran qoidasi — eng muhimi, alohida ajratilgan */}
          <section
            aria-labelledby="exam-fullscreen"
            className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <Maximize className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <h2 id="exam-fullscreen" className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Imtihon to&apos;liq ekranda o&apos;tadi
                </h2>
                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  To&apos;liq ekrandan chiqish (Esc), boshqa tab, oyna yoki ilovaga o&apos;tish — ogohlantirish.{" "}
                  <strong className="text-rose-700 dark:text-rose-300">
                    {MAX_EXAM_VIOLATIONS}-chisida imtihon yopiladi va 0 ball qo&apos;yiladi.
                  </strong>
                </p>
              </div>
            </div>

            {/* 3 ogohlantirish shkalasi */}
            <ol className="grid grid-cols-3 gap-2" aria-label={`${MAX_EXAM_VIOLATIONS} ta ogohlantirish: oxirgisida imtihon yopiladi va 0 ball qo'yiladi`}>
              {Array.from({ length: MAX_EXAM_VIOLATIONS }, (_, i) => {
                const last = i === MAX_EXAM_VIOLATIONS - 1;
                return (
                  <li
                    key={i}
                    className={cn(
                      "rounded-xl border px-2 py-2.5 text-center",
                      last
                        ? "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    )}
                  >
                    <div className="font-mono text-xl font-black leading-none tabular-nums">{i + 1}</div>
                    <div className="mt-1 text-[11px] font-semibold leading-tight">
                      {last ? "Yopiladi · 0 ball" : "Ogohlantirish"}
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-400 sm:flex-row sm:flex-wrap sm:gap-x-4">
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                Yopilgan imtihonni faqat mentor qayta ochib bera oladi.
              </span>
              <span className="inline-flex items-center gap-1.5">
                <BellOff className="w-3.5 h-3.5 text-slate-500" />
                Bildirishnomalar va boshqa dasturlarni oldindan yoping.
              </span>
            </div>
          </section>

          {error && (
            <div role="alert" className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm font-medium">
              {error}
            </div>
          )}
        </div>

        {/* Boshlash */}
        <footer className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 p-5 sm:px-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 cursor-pointer select-none min-h-[44px]">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "grid place-items-center w-5 h-5 rounded-[5px] border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-slate-900",
                agreed ? "bg-teal-600 border-teal-600 text-white" : "border-slate-400 dark:border-slate-600"
              )}
            >
              {agreed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            </span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Qoidalar bilan tanishdim</span>
          </label>

          <Button
            onClick={handleStart}
            isLoading={starting}
            disabled={!agreed || starting}
            variant="primary"
            size="lg"
            className="w-full sm:w-auto px-6 text-base font-bold gap-2 rounded-2xl shadow-md"
          >
            {!starting && <Play className="w-5 h-5 fill-current" />}
            {isRetake ? `${attemptNumber}-urinishni boshlash` : "Imtihonni boshlash"}
          </Button>
        </footer>
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Boshlash tugmasini bosganingizda ekran to&apos;liq rejimga o&apos;tadi.
      </p>
    </div>
  );
}
