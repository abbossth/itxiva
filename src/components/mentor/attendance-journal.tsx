"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttendanceJournal, AttendanceJournal as JournalData } from "@/actions/attendance.actions";
import { ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER } from "@/lib/attendance-status";
import { UZ_WEEKDAYS_SHORT, getTashkentParts, dateFromKey, toDateKey } from "@/lib/schedule";
import { cn } from "@/lib/utils";

const UZ_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

function monthRange(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}` };
}

function shiftMonth(monthKey: string, delta: number) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function percentClass(percent: number | null) {
  if (percent === null) return "text-slate-500 dark:text-slate-400";
  if (percent >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (percent >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

/** Bitta guruhning oylik davomat jurnali: o'quvchilar x darslar */
export function AttendanceJournal({ groupId, onManualEntry }: { groupId: string; onManualEntry?: () => void }) {
  const [monthKey, setMonthKey] = useState(() => toDateKey().slice(0, 7));
  // Yuklangan natija qaysi so'rovga tegishli ekani bilan birga saqlanadi (eski javob yangi tanlovni bosib ketmasligi uchun)
  const [result, setResult] = useState<{ key: string; data: JournalData | null } | null>(null);

  const requestKey = `${groupId}:${monthKey}`;
  const isLoading = result?.key !== requestKey;

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    getAttendanceJournal({ groupId, ...monthRange(monthKey) })
      .then((data) => {
        if (!cancelled) setResult({ key: `${groupId}:${monthKey}`, data });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: `${groupId}:${monthKey}`, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, monthKey]);

  const journal = isLoading ? null : result?.data ?? null;
  const [year, month] = monthKey.split("-").map(Number);
  const isCurrentMonth = monthKey >= toDateKey().slice(0, 7);

  // Guruh o'rtachasi: o'quvchilarning hisobga olingan darslari bo'yicha
  const totals = (journal?.students ?? []).reduce(
    (acc, st) => ({ attended: acc.attended + st.attended, total: acc.total + st.total }),
    { attended: 0, total: 0 }
  );
  const groupPercent = totals.total > 0 ? Math.round((totals.attended / totals.total) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface p-1">
          <button
            type="button"
            onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
            aria-label="Oldingi oy"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 min-w-[130px] text-center text-sm font-bold text-slate-900 dark:text-slate-100">
            {UZ_MONTHS[month - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
            disabled={isCurrentMonth}
            aria-label="Keyingi oy"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {journal && journal.sessions.length > 0 && (
          <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            {journal.sessions.length} ta dars · guruh o&apos;rtachasi{" "}
            <span className={cn("font-mono font-black tabular-nums", percentClass(groupPercent))}>
              {groupPercent === null ? "—" : `${groupPercent}%`}
            </span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-xl" />
          ))}
        </div>
      ) : !journal || journal.sessions.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Bu oyda davomat olinmagan"
          description="Dars boshlanganda davomat oching yoki o'tgan dars uchun qo'lda davomat kiriting"
          action={
            onManualEntry ? (
              <Button variant="secondary" onClick={onManualEntry}>
                Qo&apos;lda kiritish
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3 page-enter">
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                  <th className="sticky left-0 z-10 bg-slate-50 dark:bg-surface-2 text-left font-bold p-3 min-w-[160px]">
                    O&apos;quvchi
                  </th>
                  {journal.sessions.map((s) => {
                    const weekday = getTashkentParts(dateFromKey(s.dateKey, "12:00")).weekday;
                    return (
                      <th key={s._id} className="p-0 font-semibold">
                        <Link
                          href={`/mentor/attendance/${s._id}`}
                          title="Dars davomatini ochish"
                          className="flex flex-col items-center justify-center min-w-[44px] min-h-[48px] px-1 hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                        >
                          <span className="font-bold tabular-nums">{Number(s.dateKey.slice(8))}</span>
                          <span className="text-[10px] font-normal opacity-70">{UZ_WEEKDAYS_SHORT[weekday - 1]}</span>
                        </Link>
                      </th>
                    );
                  })}
                  <th className="p-3 font-bold text-right min-w-[70px]">Davomat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {journal.students.map((st, idx) => (
                  <tr key={st.studentId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="sticky left-0 z-10 bg-white dark:bg-surface p-3 font-semibold text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                      <span className="text-slate-500 dark:text-slate-400 font-normal mr-1.5">{idx + 1}.</span>
                      {st.fullName}
                    </td>
                    {journal.sessions.map((s) => {
                      const mark = st.marks[s._id];
                      return (
                        <td key={s._id} className="p-1 text-center">
                          <span
                            title={mark ? ATTENDANCE_STATUS_META[mark].label : "Belgilanmagan"}
                            className={cn(
                              "inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold",
                              mark ? ATTENDANCE_STATUS_META[mark].className : "text-slate-300 dark:text-slate-600"
                            )}
                          >
                            {mark ? ATTENDANCE_STATUS_META[mark].short : "·"}
                            <span className="sr-only">{mark ? ATTENDANCE_STATUS_META[mark].label : "Belgilanmagan"}</span>
                          </span>
                        </td>
                      );
                    })}
                    <td className={cn("p-3 text-right font-black tabular-nums", percentClass(st.percent))}>
                      {st.percent === null ? "—" : `${st.percent}%`}
                      <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                        {st.attended}/{st.total}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            {ATTENDANCE_STATUS_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-5 h-5 rounded-md font-bold",
                    ATTENDANCE_STATUS_META[s].className
                  )}
                >
                  {ATTENDANCE_STATUS_META[s].short}
                </span>
                {ATTENDANCE_STATUS_META[s].label}
              </span>
            ))}
            <span>Sana ustiga bosilsa o&apos;sha dars davomati ochiladi</span>
          </div>
        </div>
      )}
    </div>
  );
}
