"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, History, Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AUDIT_CATEGORY_LABELS, type AuditCategory, type AuditRow, type AuditTone } from "@/lib/audit-format";
import { cn, formatDateUz, formatTimeUz } from "@/lib/utils";
import { toDateKey } from "@/lib/schedule";

const TONE_DOT: Record<AuditTone, string> = {
  success: "bg-emerald-500",
  teal: "bg-teal-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  default: "bg-slate-400",
};
const TONE_TEXT: Record<AuditTone, string> = {
  success: "text-emerald-800 dark:text-emerald-300",
  teal: "text-slate-900 dark:text-slate-100",
  warning: "text-amber-800 dark:text-amber-300",
  danger: "text-rose-700 dark:text-rose-400",
  default: "text-slate-900 dark:text-slate-100",
};

type Filter = AuditCategory | "all" | "important";

export function AuditLogView({ rows, limit }: { rows: AuditRow[]; limit: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.category, (c.get(r.category) ?? 0) + 1);
    return c;
  }, [rows]);
  const importantCount = rows.filter((r) => r.tone === "danger" || r.tone === "warning").length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "important" ? !(r.tone === "danger" || r.tone === "warning") : filter !== "all" && r.category !== filter) return false;
      if (!q) return true;
      return [r.label, r.actor, r.target?.name ?? "", ...r.facts].join(" ").toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  // Kun bo'yicha guruhlash (Toshkent sanasi)
  const days = useMemo(() => {
    const map = new Map<string, AuditRow[]>();
    for (const r of visible) {
      const key = toDateKey(r.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [visible]);

  const todayKey = toDateKey();
  const chip = (id: Filter, label: string, count: number) => (
    <button
      key={id}
      type="button"
      aria-pressed={filter === id}
      onClick={() => setFilter(id)}
      className={cn(
        "shrink-0 px-3 rounded-xl text-xs font-semibold min-h-[36px] transition-colors cursor-pointer",
        filter === id
          ? "bg-teal-600 text-white"
          : "bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      )}
    >
      {label} <span className="font-mono opacity-80">{count}</span>
    </button>
  );

  return (
    <div className="space-y-3 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Amallar tarixi
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Kim, qachon, nima qilgani — oxirgi {Math.min(rows.length, limit)} ta amal
          </p>
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
          <Input
            aria-label="Amallarni qidirish"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="O'quvchi, dars yoki amal..."
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {chip("all", "Hammasi", rows.length)}
        {importantCount > 0 && chip("important", "Muhim (o'chirish, parol)", importantCount)}
        {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[])
          .filter((c) => counts.has(c))
          .map((c) => chip(c, AUDIT_CATEGORY_LABELS[c], counts.get(c) ?? 0))}
      </div>

      {days.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-10 text-center text-sm text-slate-600 dark:text-slate-400">
          {rows.length === 0 ? "Hali hech qanday amal qayd etilmagan" : "Bu filtr bo'yicha amal topilmadi"}
        </div>
      ) : (
        days.map(([key, items]) => (
          <section key={key} aria-label={formatDateUz(items[0].createdAt)} className="space-y-1.5">
            <h2 className="sticky top-16 z-10 -mx-1 px-1 py-1.5 bg-slate-50/95 dark:bg-bg/95 backdrop-blur-xs text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {key === todayKey ? "Bugun" : formatDateUz(items[0].createdAt)}
              <span className="ml-2 font-mono font-normal normal-case">{items.length} ta amal</span>
            </h2>
            <ul className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800/70 overflow-hidden">
              {items.map((row) => (
                <li key={row._id} className="flex items-start sm:items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <span className="mt-1 sm:mt-0 w-12 shrink-0 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                    {formatTimeUz(row.createdAt)}
                  </span>
                  <span aria-hidden className={cn("mt-1.5 sm:mt-0 h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[row.tone])} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className={cn("text-sm font-bold", TONE_TEXT[row.tone])}>{row.label}</span>
                      {row.target && (
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
                          <UserRound className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          {row.target.name}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {row.facts.map((fact, i) => (
                        <span key={i} className={i === 0 ? "font-medium text-slate-800 dark:text-slate-200" : undefined}>
                          {i > 0 && <span aria-hidden className="mr-2 text-slate-400">·</span>}
                          {fact}
                        </span>
                      ))}
                      <span>
                        {row.facts.length > 0 && <span aria-hidden className="mr-2 text-slate-400">·</span>}
                        {row.actor}
                      </span>
                    </div>
                  </div>

                  {row.link && (
                    <Link
                      href={row.link.href}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 min-h-[36px] text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 transition-colors"
                    >
                      <span className="hidden sm:inline">{row.link.label}</span>
                      <ArrowRight className="w-4 h-4" />
                      <span className="sr-only sm:hidden">{row.link.label}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
