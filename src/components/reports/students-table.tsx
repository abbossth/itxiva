"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReportSection, ScoreLegend } from "@/components/reports/report-parts";
import { SCORE_TONE, formatPercent, scoreTone } from "@/lib/score-tone";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import type { ReportData } from "@/actions/report.actions";

type Row = ReportData["studentsTable"][number];
type SortKey = "fullName" | "attendancePercent" | "homeworkPercent" | "homeworkAvg" | "quizAvgPercent" | "coinsEarned";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "attendancePercent", label: "Davomat", title: "Qatnashgan darslar ulushi" },
  { key: "homeworkPercent", label: "Vazifa", title: "Topshirilgan vazifalar ulushi" },
  { key: "homeworkAvg", label: "Vazifa bali", title: "Baholangan vazifalarning o'rtacha bali (100 dan)" },
  { key: "quizAvgPercent", label: "Testlar", title: "Testlarning o'rtacha natijasi" },
  { key: "coinsEarned", label: "Coin", title: "Davr ichida topilgan coinlar" },
];

function Cell({ value, sub }: { value: number | null; sub?: string }) {
  return (
    <td className="px-2 py-1.5 text-center">
      <span className={cn("inline-block min-w-[3.25rem] px-2 py-1 rounded-lg text-xs font-bold tabular-nums", SCORE_TONE[scoreTone(value)].soft)}>
        {formatPercent(value)}
      </span>
      {sub && <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</span>}
    </td>
  );
}

/** Har bir o'quvchining asosiy ko'rsatkichlari: past natija darhol qizil bo'lib ko'rinadi */
export function StudentsTable({ rows, fileSuffix }: { rows: Row[]; fileSuffix: string }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("fullName");
  const [asc, setAsc] = useState(true);
  const [onlyLow, setOnlyLow] = useState(false);

  const isLow = (r: Row) =>
    [r.attendancePercent, r.homeworkPercent, r.homeworkAvg, r.quizAvgPercent].some((v) => scoreTone(v) === "low");
  const lowCount = useMemo(() => rows.filter(isLow).length, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(
      (r) => (!q || r.fullName.toLowerCase().includes(q) || r.groupName.toLowerCase().includes(q)) && (!onlyLow || isLow(r))
    );
    return list.sort((a, b) => {
      if (sortKey === "fullName") return (asc ? 1 : -1) * a.fullName.localeCompare(b.fullName);
      // Ma'lumoti yo'qlar har doim oxirida
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return a.fullName.localeCompare(b.fullName);
      if (av === null) return 1;
      if (bv === null) return -1;
      return (asc ? 1 : -1) * (av - bv) || a.fullName.localeCompare(b.fullName);
    });
  }, [rows, search, sortKey, asc, onlyLow]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      // Raqamli ustunlarda avval eng past natijalar — e'tibor talab qiladiganlar tepada
      setAsc(true);
    }
  };

  const SortIcon = asc ? ArrowUp : ArrowDown;

  return (
    <ReportSection
      title="O'quvchilar kesimida"
      description="Ustun sarlavhasiga bosib saralang. Ismga bosilsa o'quvchi profili ochiladi"
      onExport={() =>
        downloadCsv(
          `oquvchilar_${fileSuffix}.csv`,
          ["O'quvchi", "Guruh", "Davomat %", "Qoldirgan", "Vazifa topshirgan", "Vazifa berilgan", "Vazifa %", "Vazifa o'rtacha bali", "Test %", "Testlar soni", "Coin"],
          visible.map((r) => [
            r.fullName,
            r.groupName,
            r.attendancePercent ?? "",
            r.absent,
            r.homeworkSubmitted,
            r.homeworkExpected,
            r.homeworkPercent ?? "",
            r.homeworkAvg ?? "",
            r.quizAvgPercent ?? "",
            r.quizCount,
            r.coinsEarned,
          ])
        )
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism yoki guruh..." className="pl-9" aria-label="O'quvchini qidirish" />
        </div>
        <button
          type="button"
          aria-pressed={onlyLow}
          onClick={() => setOnlyLow(!onlyLow)}
          className={cn(
            "px-3 min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer transition-colors",
            onlyLow ? "bg-rose-600 text-white" : SCORE_TONE.low.soft
          )}
        >
          E&apos;tibor talab qiladi: {lowCount}
        </button>
        <ScoreLegend className="sm:ml-auto" />
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">O&apos;quvchi topilmadi</p>
      ) : (
        <div className="overflow-auto max-h-[36rem] -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-white dark:bg-surface text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 shadow-[0_1px_0_0_var(--border)]">
                <th className="py-2 pr-2 text-left font-bold">
                  <button type="button" onClick={() => sortBy("fullName")} className="inline-flex items-center gap-1 min-h-[36px] uppercase cursor-pointer hover:text-slate-900 dark:hover:text-slate-100">
                    O&apos;quvchi
                    {sortKey === "fullName" && <SortIcon className="w-3 h-3" />}
                  </button>
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-center font-bold" aria-sort={sortKey === c.key ? (asc ? "ascending" : "descending") : undefined}>
                    <button type="button" title={c.title} onClick={() => sortBy(c.key)} className="inline-flex items-center gap-1 min-h-[36px] uppercase cursor-pointer hover:text-slate-900 dark:hover:text-slate-100">
                      {c.label}
                      {sortKey === c.key && <SortIcon className="w-3 h-3" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map((r) => (
                <tr key={r.studentId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="py-1.5 pr-2">
                    <Link href={`/mentor/students/${r.studentId}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                      {r.fullName}
                    </Link>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">{r.groupName}</span>
                  </td>
                  <Cell value={r.attendancePercent} sub={r.absent > 0 ? `${r.absent} ta qoldirgan` : undefined} />
                  <Cell value={r.homeworkPercent} sub={r.homeworkExpected > 0 ? `${r.homeworkSubmitted} / ${r.homeworkExpected}` : undefined} />
                  <td className="px-2 py-1.5 text-center">
                    <span className={cn("inline-block min-w-[3.25rem] px-2 py-1 rounded-lg text-xs font-bold tabular-nums", SCORE_TONE[scoreTone(r.homeworkAvg)].soft)}>
                      {r.homeworkAvg ?? "—"}
                    </span>
                  </td>
                  <Cell value={r.quizAvgPercent} sub={r.quizCount > 0 ? `${r.quizCount} ta test` : undefined} />
                  <td className="px-2 py-1.5 text-center font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {r.coinsEarned > 0 ? `+${r.coinsEarned}` : r.coinsEarned}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportSection>
  );
}
