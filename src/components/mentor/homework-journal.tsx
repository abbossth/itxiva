import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { HomeworkJournal as JournalData } from "@/actions/homework.actions";
import { cn, formatDateTimeUz } from "@/lib/utils";

function scoreClass(score: number) {
  if (score >= 85) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (score >= 60) return "bg-amber-500/20 text-amber-800 dark:text-amber-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

/** Vazifalar jurnali: o'quvchilar x vazifali darslar. Katak bosilsa o'sha javob tekshirish sahifasida ochiladi */
export function HomeworkJournal({ journal }: { journal: JournalData | null }) {
  if (!journal || journal.lessons.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Bu chorakda uyga vazifa berilmagan"
        description="Darsni tahrirlashda “Uyga vazifa” blokini yoqing — vazifa shu jadvalda paydo bo'ladi."
      />
    );
  }
  // eslint-disable-next-line react-hooks/purity -- server komponent: har so'rovda bir marta hisoblanadi
  const now = Date.now();
  const total = journal.lessons.length;

  return (
    <div className="space-y-2 page-enter">
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
              <th className="sticky left-0 z-10 bg-slate-50 dark:bg-surface-2 text-left font-bold px-3 py-2 min-w-[160px]">O&apos;quvchi</th>
              {journal.lessons.map((l) => (
                <th key={l._id} className="p-0 font-semibold">
                  <Link
                    href={`/mentor/homework/${l._id}`}
                    title={`${l.title}${l.dueAt ? ` — muddat: ${formatDateTimeUz(l.dueAt)}` : ""}`}
                    className="flex flex-col items-center justify-center min-w-[52px] min-h-[40px] px-1 hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    <span className="font-bold tabular-nums">{l.order}-dars</span>
                    <span className="max-w-[72px] truncate text-[10px] font-normal opacity-70">{l.title}</span>
                  </Link>
                </th>
              ))}
              <th className="px-3 py-2 font-bold text-right min-w-[96px]">Topshirdi · o&apos;rtacha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {journal.students.map((st, idx) => (
              <tr key={st.studentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                <td className="sticky left-0 z-10 bg-white dark:bg-surface px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                  <span className="text-slate-500 dark:text-slate-400 font-normal mr-1.5">{idx + 1}.</span>
                  {st.fullName}
                </td>
                {journal.lessons.map((l) => {
                  const cell = st.cells[l._id];
                  const overdue = !cell && l.dueAt !== null && new Date(l.dueAt).getTime() < now;
                  const label = !cell
                    ? overdue
                      ? "Topshirmagan, muddat o'tgan"
                      : "Hali topshirmagan"
                    : cell.state === "graded"
                      ? `${cell.score} ball${cell.isLate ? ", kechikkan" : ""}`
                      : cell.state === "submitted"
                        ? "Tekshirish kerak"
                        : "Qayta ishlashga qaytarilgan";
                  const body = (
                    <span
                      title={label}
                      className={cn(
                        "inline-flex items-center justify-center min-w-8 h-7 px-1 rounded-lg font-mono font-bold tabular-nums",
                        !cell
                          ? overdue
                            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                            : "text-slate-400 dark:text-slate-600"
                          : cell.state === "graded"
                            ? scoreClass(cell.score ?? 0)
                            : cell.state === "submitted"
                              ? "bg-teal-600 text-white"
                              : "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                      )}
                    >
                      {!cell ? (overdue ? "✗" : "·") : cell.state === "graded" ? cell.score : cell.state === "submitted" ? "?" : "↩"}
                      <span className="sr-only">{label}</span>
                    </span>
                  );
                  return (
                    <td key={l._id} className="px-1 py-0.5 text-center">
                      {cell ? (
                        <Link href={`/mentor/homework/${l._id}?student=${st.studentId}`} className="inline-flex rounded-lg hover:ring-2 hover:ring-teal-500/40">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  <span className={cn("font-bold", st.done < total ? "text-rose-700 dark:text-rose-400" : "text-slate-900 dark:text-slate-100")}>
                    {st.done}/{total}
                  </span>
                  <span className="ml-2 text-slate-600 dark:text-slate-400">{st.avgScore === null ? "—" : st.avgScore}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
        <span><b className="font-mono">85</b> — ball</span>
        <span><b className="font-mono text-teal-700 dark:text-teal-300">?</b> — tekshirish kerak</span>
        <span><b className="font-mono">↩</b> — qayta ishlashga qaytarilgan</span>
        <span><b className="font-mono text-rose-700 dark:text-rose-400">✗</b> — topshirmagan, muddat o&apos;tgan</span>
        <span><b className="font-mono">·</b> — hali topshirmagan</span>
        <span>Katak bosilsa javob ochiladi</span>
      </p>
    </div>
  );
}
