"use client";

import Link from "@/components/ui/link";
import { Badge } from "@/components/ui/badge";
import { ColumnHeader, TableFilterBar, useTableControls, type ColumnDef } from "@/components/ui/table-controls";
import { HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS, type HomeworkState } from "@/lib/homework-status";
import { SCORE_TONE, scoreTone } from "@/lib/score-tone";
import { cn } from "@/lib/utils";

export interface LessonResultRow {
  id: string;
  fullName: string;
  homeworkState: HomeworkState;
  homeworkScore: number | null;
  quiz: { score: number; max: number; percent: number | null } | null;
}

const pill = "inline-block min-w-[3.5rem] px-2 py-1 rounded-lg text-xs font-bold tabular-nums text-center";

const COLUMNS: ColumnDef<LessonResultRow>[] = [
  { key: "fullName", label: "O'quvchi", value: (r) => r.fullName, filter: "text" },
  // Vazifa: ball bo'lsa — ball, bo'lmasa holat (filtrda holatlar ro'yxati)
  { key: "homework", label: "Uyga vazifa", value: (r) => r.homeworkScore ?? HOMEWORK_STATE_LABELS[r.homeworkState], filter: "options" },
  { key: "quiz", label: "Test", value: (r) => r.quiz?.percent ?? null, filter: "range" },
];

/** Dars natijalari: o'quvchi, vazifa va test — ustun sarlavhasidan saralash/filtr */
export function LessonResultsTable({ rows, showHomework, showQuiz }: { rows: LessonResultRow[]; showHomework: boolean; showQuiz: boolean }) {
  const table = useTableControls(rows, COLUMNS);
  return (
    <div className="space-y-2">
      <TableFilterBar table={table} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-2 text-left font-bold"><ColumnHeader table={table} column="fullName">O&apos;quvchi</ColumnHeader></th>
              {showHomework && <th className="px-2 py-2 text-center font-bold"><ColumnHeader table={table} column="homework" align="center">Uyga vazifa</ColumnHeader></th>}
              {showQuiz && <th className="px-2 py-2 text-center font-bold"><ColumnHeader table={table} column="quiz" align="center">Test</ColumnHeader></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {table.rows.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 pr-2">
                  <Link href={`/mentor/students/${r.id}`} className="font-semibold text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300 hover:underline">
                    {r.fullName}
                  </Link>
                </td>
                {showHomework && (
                  <td className="px-2 py-1.5 text-center">
                    {r.homeworkScore !== null ? (
                      <span className={cn(pill, SCORE_TONE[scoreTone(r.homeworkScore)].soft)}>{r.homeworkScore} / 100</span>
                    ) : (
                      <Badge variant={HOMEWORK_STATE_BADGE[r.homeworkState]}>{HOMEWORK_STATE_LABELS[r.homeworkState]}</Badge>
                    )}
                  </td>
                )}
                {showQuiz && (
                  <td className="px-2 py-1.5 text-center">
                    {r.quiz ? (
                      <span className={cn(pill, SCORE_TONE[scoreTone(r.quiz.percent)].soft)}>
                        {r.quiz.score} / {r.quiz.max}
                      </span>
                    ) : (
                      <span className={cn(pill, SCORE_TONE.none.soft)}>—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
