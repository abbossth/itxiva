"use client";

import { useEffect, useState } from "react";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { Bot, Copy, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkHomeworkIntegrityAction, type IntegrityView } from "@/actions/homework.actions";
import { cn } from "@/lib/utils";

// Plagiat va AI foizining darajasi: 60% va undan yuqori — qizil
export type IntegrityLevel = "low" | "medium" | "high";

export function integrityLevel(percent: number): IntegrityLevel {
  if (percent >= 60) return "high";
  if (percent >= 30) return "medium";
  return "low";
}

const LEVEL_LABEL: Record<IntegrityLevel, string> = { low: "past", medium: "o'rtacha", high: "yuqori" };

const CHIP_TONE: Record<IntegrityLevel, string> = {
  low: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40",
};

const BAR_TONE: Record<IntegrityLevel, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-rose-500",
};

const TEXT_TONE: Record<IntegrityLevel, string> = {
  low: "text-emerald-700 dark:text-emerald-400",
  medium: "text-amber-700 dark:text-amber-400",
  high: "text-rose-700 dark:text-rose-400",
};

function Chip({ icon: Icon, label, percent }: { icon: typeof Bot; label: string; percent: number | null }) {
  const level = percent === null ? null : integrityLevel(percent);
  return (
    <span
      title={percent === null ? `${label}: aniqlab bo'lmadi` : `${label}: ${percent}% (${LEVEL_LABEL[level!]})`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none whitespace-nowrap",
        level ? CHIP_TONE[level] : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
      )}
    >
      <Icon className="w-3 h-3" />
      {label} {percent === null ? "—" : `${percent}%`}
    </span>
  );
}

/** Ro'yxatlar uchun ixcham belgi: "Plagiat 89%" va "AI 72%" */
export function IntegrityChips({ integrity, className }: { integrity: IntegrityView | null; className?: string }) {
  if (!integrity) return null;
  if (integrity.status === "pending") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400", className)}>
        <Loader2 className="w-3 h-3 animate-spin" />
        tekshirilmoqda
      </span>
    );
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <Chip icon={Copy} label="Plagiat" percent={integrity.similarity} />
      <Chip icon={Bot} label="AI" percent={integrity.aiScore} />
    </span>
  );
}

function Meter({ label, icon: Icon, percent }: { label: string; icon: typeof Bot; percent: number | null }) {
  const level = percent === null ? null : integrityLevel(percent);
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-2xl font-black tabular-nums leading-none", level ? TEXT_TONE[level] : "text-slate-400")}>
        {percent === null ? "—" : `${percent}%`}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        {level && <div className={cn("h-full rounded-full", BAR_TONE[level])} style={{ width: `${Math.max(3, percent!)}%` }} />}
      </div>
      <div className={cn("mt-1 text-[11px] font-semibold", level ? TEXT_TONE[level] : "text-slate-500 dark:text-slate-400")}>
        {level ? `Daraja: ${LEVEL_LABEL[level]}` : "Aniqlab bo'lmadi"}
      </div>
    </div>
  );
}

/** Tekshiruv tugaguncha sahifa vaqti-vaqti bilan yangilanadi (ko'pi bilan ~1 daqiqa) */
function useRefreshWhilePending(pending: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      router.refresh();
      if (ticks >= 15) clearInterval(id);
    }, 4000);
    return () => clearInterval(id);
  }, [pending, router]);
}

/**
 * Batafsil hisobot. O'quvchiga boshqa o'quvchilarning ismi ko'rsatilmaydi;
 * mentor ismni bosib o'xshash javobni ochadi va tekshiruvni qayta ishga tushira oladi.
 */
export function IntegrityReport({
  integrity,
  submissionId,
  mentor = false,
}: {
  integrity: IntegrityView | null;
  submissionId: string;
  mentor?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useRefreshWhilePending(integrity?.status === "pending");

  const recheck = async () => {
    try {
      setBusy(true);
      setError(null);
      const res = await checkHomeworkIntegrityAction(submissionId);
      if (res.success) router.refresh();
      else setError(res.message || "Tekshirib bo'lmadi");
    } catch {
      setError("Tekshirib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  if (!integrity) {
    if (!mentor) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-3 text-sm">
        <ShieldCheck className="w-4 h-4 text-slate-500" />
        <span className="text-slate-600 dark:text-slate-400">Plagiat va AI tekshiruvi o&apos;tkazilmagan</span>
        <Button type="button" size="sm" variant="outline" onClick={recheck} isLoading={busy} className="ml-auto min-h-[36px]">
          Tekshirish
        </Button>
        {error && <p role="alert" className="w-full text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    );
  }

  const pending = integrity.status === "pending";
  return (
    <section aria-label="Plagiat va AI tekshiruvi" className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Plagiat va AI tekshiruvi</h3>
        {pending && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            tekshirilmoqda…
          </span>
        )}
        {mentor && !pending && (
          <button
            type="button"
            onClick={recheck}
            disabled={busy}
            title="Qayta tekshirish"
            aria-label="Qayta tekshirish"
            className="ml-auto p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", busy && "animate-spin")} />
          </button>
        )}
      </div>

      {!pending && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Meter label="Plagiat (boshqa javoblarga o'xshashlik)" icon={Copy} percent={integrity.similarity} />
            <Meter label="AI yordamida yozilgan bo'lishi" icon={Bot} percent={integrity.aiScore} />
          </div>

          {integrity.matches.length > 0 && (
            <ul className="text-sm space-y-0.5">
              {integrity.matches.map((m, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn("font-mono text-xs font-bold tabular-nums", TEXT_TONE[integrityLevel(m.percent)])}>
                    {m.percent}%
                  </span>
                  {mentor && m.fullName && m.lessonId ? (
                    <>
                      <Link
                        href={`/mentor/homework/${m.lessonId}?student=${m.studentId}`}
                        target="_blank"
                        className="font-medium text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        {m.fullName}
                      </Link>
                      {m.groupName && <span className="text-xs text-slate-500 dark:text-slate-400">{m.groupName}</span>}
                    </>
                  ) : (
                    <span className="text-slate-700 dark:text-slate-300">boshqa o&apos;quvchining javobi bilan mos keladi</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {integrity.aiSignals.length > 0 && (
            <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc pl-5 space-y-0.5">
              {integrity.aiSignals.map((s, i) => (
                <li key={i} className="break-words">{s}</li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {mentor
              ? "Plagiat foizi matn va fayllarni aniq solishtirib hisoblanadi. AI foizi — taxmin: shubha bo'lsa, o'quvchidan yechimini tushuntirib berishni so'rang."
              : "Plagiat foizi javobing boshqa o'quvchilarnikiga qanchalik o'xshashligini ko'rsatadi. AI foizi — taxmin; vazifani o'zing bajargan bo'lsang, mentor buni tushuntirib berishingni so'rashi mumkin."}
          </p>
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </section>
  );
}
