"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, HelpCircle, Link2, Loader2 } from "lucide-react";
import { setLessonVisibilityAction, type LinkedLessonInfo } from "@/actions/lesson.actions";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTimeUz } from "@/lib/utils";

/**
 * Darsning vazifasi va testini shu guruh o'quvchilariga ochish/yopish. Bir dars bir necha guruhda bo'lsa,
 * har birida alohida ochiladi: dars o'tgan guruhda ochiladi, hali o'tmaganida yopiq turadi.
 */
export function LessonVisibility({
  lessonId,
  groupName,
  homework,
  quiz,
  linked,
}: {
  lessonId: string;
  groupName: string | null;
  homework: { open: boolean; dueAt: string | null } | null;
  quiz: { open: boolean } | null;
  linked: LinkedLessonInfo[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"homework" | "quiz" | null>(null);

  if (!homework && !quiz) return null;

  const toggle = async (kind: "homework" | "quiz", open: boolean) => {
    setBusy(kind);
    try {
      const res = await setLessonVisibilityAction({ lessonId, [kind]: open });
      if (res.success) {
        toast.success(res.message ? res.message[0].toUpperCase() + res.message.slice(1) : "Saqlandi");
        router.refresh();
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setBusy(null);
    }
  };

  const row = (kind: "homework" | "quiz", open: boolean, title: string, hint: string, Icon: typeof HelpCircle) => (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border p-3",
        open ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-400/50 bg-amber-50 dark:bg-amber-500/10"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          open ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
        )}
      >
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
          {title}: {open ? "o'quvchilarga ochiq" : "yopiq"}
        </span>
        <span className="block text-xs text-slate-600 dark:text-slate-400">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label={`${title}ni ${open ? "yopish" : "ochish"}`}
        disabled={busy !== null}
        onClick={() => void toggle(kind, !open)}
        className={cn(
          "inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors cursor-pointer disabled:opacity-60",
          open
            ? "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50"
            : "bg-teal-600 text-white hover:bg-teal-700"
        )}
      >
        {busy === kind && <Loader2 className="w-4 h-4 animate-spin" />}
        {open ? "Yopish" : "O'quvchilarga ochish"}
      </button>
    </div>
  );

  const groupLabel = groupName ? `${groupName} guruhi` : "shu guruh";

  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-4 sm:p-5 space-y-3 shadow-xs">
      <div>
        <h2 className="font-bold text-slate-900 dark:text-slate-100">Vazifa va test — {groupLabel}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Dars materiallari o&apos;quvchilarga darhol ko&apos;rinadi. Vazifa va testni shu guruhda dars o&apos;tgach oching.
        </p>
      </div>

      {homework &&
        row(
          "homework",
          homework.open,
          "Uyga vazifa",
          homework.open
            ? homework.dueAt
              ? `Muddat: ${formatDateTimeUz(homework.dueAt)}`
              : "Muddatsiz"
            : "Ochilganda muddat guruhning keyingi darsiga qo'yiladi va o'quvchilarga xabar boradi",
          ClipboardCheck
        )}
      {quiz &&
        row(
          "quiz",
          quiz.open,
          "Test",
          quiz.open ? "O'quvchilar testni yecha oladi" : "Ochilganda o'quvchilarga xabar boradi",
          HelpCircle
        )}

      {linked.length > 0 && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <Link2 className="w-3.5 h-3.5" />
            Bu dars boshqa guruhlarda ham bor — u yerda alohida ochiladi:
          </p>
          <ul className="flex flex-wrap gap-2">
            {linked.map((l) => (
              <li key={l._id}>
                <Link
                  href={`/mentor/lessons/${l._id}`}
                  className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface px-2.5 text-xs hover:border-teal-500/50"
                >
                  <span className="font-bold text-slate-900 dark:text-slate-100">{l.groupName}</span>
                  {l.homeworkOpen !== null && (
                    <span className={l.homeworkOpen ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}>
                      vazifa {l.homeworkOpen ? "ochiq" : "yopiq"}
                    </span>
                  )}
                  {l.quizOpen !== null && (
                    <span className={l.quizOpen ? "text-emerald-700 dark:text-emerald-400" : "text-slate-500"}>
                      test {l.quizOpen ? "ochiq" : "yopiq"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
