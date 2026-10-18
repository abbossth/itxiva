"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Loader2 } from "lucide-react";
import { setLessonVisibilityAction, type LinkedLessonInfo } from "@/actions/lesson.actions";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTimeUz } from "@/lib/utils";

/**
 * Vazifa yoki testni shu guruh o'quvchilariga ochish/yopish — o'z tabining tepasida ixcham qator.
 * Bir dars bir necha guruhda bo'lsa, har birida alohida ochiladi: dars o'tgan guruhda ochiladi, o'tmaganida yopiq turadi.
 */
export function VisibilityToggle({
  lessonId,
  kind,
  open,
  dueAt,
  groupName,
}: {
  lessonId: string;
  kind: "homework" | "quiz";
  open: boolean;
  dueAt?: string | null;
  groupName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const title = kind === "homework" ? "Vazifa" : "Test";

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await setLessonVisibilityAction({ lessonId, [kind]: !open });
      if (res.success) {
        toast.success(res.message ? res.message[0].toUpperCase() + res.message.slice(1) : "Saqlandi");
        router.refresh();
      } else {
        toast.error(res.message || "Xatolik yuz berdi");
      }
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  };

  const hint = open
    ? kind === "homework"
      ? dueAt
        ? `Muddat: ${formatDateTimeUz(dueAt)}`
        : "Muddatsiz"
      : "O'quvchilar yecha oladi"
    : kind === "homework"
      ? "Ochilganda muddat keyingi darsga qo'yiladi va o'quvchilarga xabar boradi"
      : "Ochilganda o'quvchilarga xabar boradi";

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-1.5",
        open ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-400/40 bg-amber-50 dark:bg-amber-500/10"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", open ? "bg-emerald-500" : "bg-amber-500")} aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
            {title} {groupName ? `${groupName} uchun ` : ""}
            {open ? "ochiq" : "yopiq"}
          </span>
          <span className="block truncate text-[11px] text-slate-600 dark:text-slate-400">{hint}</span>
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label={`${title}ni ${open ? "yopish" : "ochish"}`}
        disabled={busy}
        onClick={() => void toggle()}
        className={cn(
          "inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors cursor-pointer disabled:opacity-60",
          open
            ? "border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            : "bg-teal-600 text-white hover:bg-teal-700"
        )}
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {open ? "Yopish" : "O'quvchilarga ochish"}
      </button>
    </div>
  );
}

/** Shu darsning boshqa guruhlardagi nusxalari va ulardagi vazifa/test holati — sarlavha ostida ixcham qator */
export function LinkedGroupsStrip({ linked }: { linked: LinkedLessonInfo[] }) {
  if (linked.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 font-semibold text-slate-500 dark:text-slate-400" title="Vazifa va test har guruhda alohida ochiladi">
        <Link2 className="w-3.5 h-3.5" />
        Boshqa guruhlarda:
      </span>
      {linked.map((l) => (
        <Link
          key={l._id}
          href={`/mentor/lessons/${l._id}`}
          className="inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2 hover:border-teal-500/50"
          title={[l.homeworkOpen !== null && `vazifa ${l.homeworkOpen ? "ochiq" : "yopiq"}`, l.quizOpen !== null && `test ${l.quizOpen ? "ochiq" : "yopiq"}`]
            .filter(Boolean)
            .join(", ")}
        >
          <span className="font-bold text-slate-800 dark:text-slate-200">{l.groupName}</span>
          {l.homeworkOpen !== null && <Dot open={l.homeworkOpen} label="vazifa" />}
          {l.quizOpen !== null && <Dot open={l.quizOpen} label="test" />}
        </Link>
      ))}
    </div>
  );
}

function Dot({ open, label }: { open: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold",
        open ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
      )}
    >
      {label}
    </span>
  );
}
