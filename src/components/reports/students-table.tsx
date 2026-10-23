"use client";

import { useMemo, useState } from "react";
import Link from "@/components/ui/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReportSection, ScoreLegend } from "@/components/reports/report-parts";
import { SCORE_TONE, formatPercent, scoreTone } from "@/lib/score-tone";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { ColumnHeader, TableFilterBar, useTableControls, type ColumnDef } from "@/components/ui/table-controls";
import type { ReportData } from "@/actions/report.actions";

type Row = ReportData["studentsTable"][number];
type SortKey = "attendancePercent" | "homeworkPercent" | "homeworkAvg" | "quizAvgPercent" | "coinsEarned";

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
const TABLE_COLUMNS: ColumnDef<Row>[] = [
  { key: "fullName", label: "O'quvchi", value: (r) => r.fullName, filter: "text" },
  { key: "groupName", label: "Guruh", value: (r) => r.groupName },
  ...COLUMNS.map((c) => ({ key: c.key, label: c.label, value: (r: Row) => r[c.key] })),
];

export function StudentsTable({ rows, fileSuffix }: { rows: Row[]; fileSuffix: string }) {
  const [search, setSearch] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  const isLow = (r: Row) =>
    [r.attendancePercent, r.homeworkPercent, r.homeworkAvg, r.quizAvgPercent].some((v) => scoreTone(v) === "low");
  const lowCount = useMemo(() => rows.filter(isLow).length, [rows]);

  // Qidiruv va "e'tibor talab qiladi" — umumiy filtrlar; ustunlar bo'yicha saralash va filtr — sarlavhadan
  const prefiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!q || r.fullName.toLowerCase().includes(q) || r.groupName.toLowerCase().includes(q)) && (!onlyLow || isLow(r)));
  }, [rows, search, onlyLow]);
  const table = useTableControls(prefiltered, TABLE_COLUMNS, { key: "fullName", dir: "asc" });
  const visible = table.rows;

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
      <TableFilterBar table={table} />

      {visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">O&apos;quvchi topilmadi</p>
      ) : (
        <div className="overflow-auto max-h-[36rem] -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="sticky top-0 z-10 bg-white dark:bg-surface text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 shadow-[0_1px_0_0_var(--border)]">
                <th className="py-2 pr-2 text-left font-bold">
                  <ColumnHeader table={table} column="fullName">O&apos;quvchi</ColumnHeader>
                  <span className="mx-1 text-slate-300 dark:text-slate-600">/</span>
                  <ColumnHeader table={table} column="groupName">Guruh</ColumnHeader>
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} title={c.title} className="px-2 py-2 text-center font-bold">
                    <ColumnHeader table={table} column={c.key} align="center">
                      {c.label}
                    </ColumnHeader>
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
