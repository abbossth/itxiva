"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, ClipboardCheck, FileText, Link2, PartyPopper, Search, Type } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS } from "@/lib/homework-status";
import { SCORE_TONE, scoreTone } from "@/lib/score-tone";
import { cn, formatDateTimeUz } from "@/lib/utils";
import type { HomeworkInboxItem } from "@/actions/homework.actions";
import { IntegrityChips } from "@/components/homework/integrity-report";

type Tab = "pending" | "recent";

/** "3 soat oldin" — navbatda qancha kutayotgani */
function waitingFor(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)} daqiqa oldin`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.round(hours / 24)} kun oldin`;
}

export function HomeworkInbox({
  pending,
  recent,
  initialGroupId,
}: {
  pending: HomeworkInboxItem[];
  recent: HomeworkInboxItem[];
  initialGroupId?: string;
}) {
  const [tab, setTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; label: string; title: string; count: number }>();
    for (const item of pending) {
      const g = map.get(item.groupId) ?? { id: item.groupId, label: item.groupShortName, title: item.groupName, count: 0 };
      g.count++;
      map.set(item.groupId, g);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [pending]);
  const [groupId, setGroupId] = useState(groups.some((g) => g.id === initialGroupId) ? initialGroupId! : "");

  const source = tab === "pending" ? pending : recent;
  const q = search.trim().toLowerCase();
  const rows = source.filter(
    (r) =>
      (tab !== "pending" || !groupId || r.groupId === groupId) &&
      (!q || r.studentName.toLowerCase().includes(q) || r.lessonTitle.toLowerCase().includes(q))
  );

  return (
    <div className="space-y-4 max-w-4xl pb-12">
      <PageHeader
        icon={ClipboardCheck}
        title="Vazifa javoblari"
        subtitle={
          pending.length > 0
            ? `${pending.length} ta javob tekshirishni kutmoqda — eng oldin yuborilgani tepada`
            : "Barcha javoblar tekshirilgan"
        }
        backHref="/mentor/lessons"
        backLabel="Darslarga qaytish"
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div role="tablist" className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/60 w-fit">
          {(
            [
              ["pending", `Tekshirish kerak (${pending.length})`],
              ["recent", "So'nggi tekshirilganlar"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "px-3.5 min-h-[40px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all",
                tab === id
                  ? "bg-white dark:bg-surface text-teal-700 dark:text-teal-300 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="O'quvchi yoki dars..." className="pl-9" aria-label="Qidirish" />
        </div>
      </div>

      {tab === "pending" && groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[{ id: "", label: "Barcha guruhlar", title: "", count: pending.length }, ...groups].map((g) => (
            <button
              key={g.id || "all"}
              type="button"
              aria-pressed={groupId === g.id}
              title={g.title || undefined}
              onClick={() => setGroupId(g.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl text-xs font-semibold cursor-pointer transition-colors",
                groupId === g.id
                  ? "bg-teal-600 text-white"
                  : "bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-teal-500/50"
              )}
            >
              {g.label}
              <span className={cn("font-mono tabular-nums", groupId === g.id ? "text-white/80" : "text-slate-500 dark:text-slate-400")}>{g.count}</span>
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="py-14 text-center rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80">
          {tab === "pending" && pending.length === 0 ? (
            <>
              <PartyPopper className="w-8 h-8 mx-auto text-emerald-500" />
              <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">Hammasi tekshirilgan</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Yangi javob kelganda shu yerda va navigatsiyadagi sonda ko&apos;rinadi</p>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Javob topilmadi</p>
          )}
        </div>
      ) : (
        <ul className="rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {rows.map((r) => (
            <li key={r.submissionId}>
              <Link
                href={`/mentor/homework/${r.lessonId}?student=${r.studentId}`}
                className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors focus-visible:outline-hidden focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/40"
              >
                <Avatar name={r.studentName} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{r.studentName}</span>
                    <Badge variant="teal" title={r.groupName}>
                      {r.groupShortName}
                    </Badge>
                    {r.isLate && <Badge variant="danger">Kechikkan</Badge>}
                    {r.attempt > 1 && <Badge variant="secondary">{r.attempt}-urinish</Badge>}
                    <IntegrityChips integrity={r.integrity} />
                  </span>
                  <span className="block truncate text-sm text-slate-700 dark:text-slate-300">
                    <span className="text-slate-500 dark:text-slate-400">{r.order}-dars · </span>
                    {r.lessonTitle}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span title={formatDateTimeUz(r.submittedAt)} suppressHydrationWarning>{tab === "pending" ? waitingFor(r.submittedAt) : formatDateTimeUz(r.submittedAt)}</span>
                    {r.hasText && (
                      <span className="inline-flex items-center gap-1">
                        <Type className="w-3 h-3" />
                        matn
                      </span>
                    )}
                    {r.links > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Link2 className="w-3 h-3" />
                        {r.links} havola
                      </span>
                    )}
                    {r.files > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {r.files} fayl
                      </span>
                    )}
                  </span>
                </span>
                {r.status === "graded" && r.score !== null ? (
                  <span className={cn("shrink-0 px-2 py-1 rounded-lg text-xs font-bold tabular-nums", SCORE_TONE[scoreTone(r.score)].soft)}>
                    {r.score} / 100
                  </span>
                ) : r.status === "submitted" ? (
                  <span className="shrink-0 hidden sm:inline text-xs font-semibold text-teal-700 dark:text-teal-300">Baholash</span>
                ) : (
                  <Badge variant={HOMEWORK_STATE_BADGE[r.status]}>{HOMEWORK_STATE_LABELS[r.status]}</Badge>
                )}
                <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
