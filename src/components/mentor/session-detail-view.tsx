"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import {
  manualUpdateAttendanceAction,
  exportAttendanceCsvAction,
  SessionDetail,
  SessionRosterRow,
} from "@/actions/attendance.actions";
import { ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER } from "@/lib/attendance-status";
import { triggerDownload } from "@/lib/xlsx-client";
import { cn, formatDateUz, formatTimeUz } from "@/lib/utils";
import { UZ_WEEKDAYS, getTashkentParts } from "@/lib/schedule";
import type { AttendanceStatus } from "@/lib/db/models/attendance-record.model";

const METHOD_LABEL = { qr: "QR", code: "Kod", manual: "Qo'lda" } as const;

export function SessionDetailView({ detail }: { detail: SessionDetail }) {
  const { toast } = useToast();
  const [roster, setRoster] = useState<SessionRosterRow[]>(detail.roster);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AttendanceStatus | "all">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = { present: 0, late: 0, excused: 0, absent: 0 };
    for (const r of roster) c[r.status ?? "absent"]++;
    return c;
  }, [roster]);

  const attended = counts.present + counts.late;
  // Sababli qoldirganlar foiz hisobiga kirmaydi (jurnal va hisobotlar bilan bir xil qoida)
  const counted = roster.length - counts.excused;
  const percent = counted > 0 ? Math.round((attended / counted) * 100) : 0;

  const visible = roster.filter(
    (r) =>
      (filter === "all" || (r.status ?? "absent") === filter) &&
      (r.fullName.toLowerCase().includes(search.toLowerCase()) || r.login.includes(search.toLowerCase()))
  );

  const setStatus = async (row: SessionRosterRow, status: AttendanceStatus) => {
    if ((row.status ?? "absent") === status && row.status !== null) return;
    const previous = roster;
    // Optimistik yangilanish: tugma darhol bo'yaladi, xato bo'lsa eski holat qaytadi
    setRoster((rows) => rows.map((r) => (r.studentId === row.studentId ? { ...r, status } : r)));
    setPendingId(row.studentId);
    try {
      const res = await manualUpdateAttendanceAction({
        sessionId: detail.session._id,
        studentId: row.studentId,
        status,
      });
      if (!res.success) {
        setRoster(previous);
        toast.error(res.message || "O'zgartirib bo'lmadi");
      }
    } catch {
      setRoster(previous);
      toast.error("O'zgartirib bo'lmadi");
    } finally {
      setPendingId(null);
    }
  };

  const handleExport = async () => {
    try {
      const csv = await exportAttendanceCsvAction(detail.session._id);
      triggerDownload(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
        `davomat_${detail.group?.name || "guruh"}_${detail.session.date.slice(0, 10)}.csv`
      );
    } catch {
      toast.error("CSV eksportda xatolik yuz berdi");
    }
  };

  const weekday = UZ_WEEKDAYS[getTashkentParts(detail.session.date).weekday - 1];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        icon={ClipboardCheck}
        title={`${detail.group?.name ?? "Guruh"} — ${formatDateUz(detail.session.date)}`}
        subtitle={`${weekday}, ${formatTimeUz(detail.session.startTime)}${
          detail.session.endTime ? `–${formatTimeUz(detail.session.endTime)}` : ""
        } · qatnashganga +${detail.session.defaultCoinsReward} coin`}
        backHref="/mentor/attendance"
        backLabel="Davomatga qaytish"
        actions={
          <Button variant="secondary" onClick={handleExport} className="gap-2">
            <Download className="w-4 h-4" />
            CSV
          </Button>
        }
      />

      {/* Xulosa */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{percent}%</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {roster.length} o&apos;quvchidan {attended} nafari qatnashdi
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {ATTENDANCE_STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(filter === s ? "all" : s)}
                className={cn(
                  "px-2.5 min-h-[36px] rounded-lg text-xs font-bold transition-all cursor-pointer border",
                  ATTENDANCE_STATUS_META[s].className,
                  filter === s ? "border-current" : "border-transparent"
                )}
              >
                {ATTENDANCE_STATUS_META[s].label}: {counts[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-teal-500 to-blue-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none" />
        <Input
          aria-label="O'quvchini qidirish"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="O'quvchini qidirish..."
          className="pl-10"
        />
      </div>

      {/* Ro'yxat */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800">
        {visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">O&apos;quvchi topilmadi</div>
        ) : (
          visible.map((row) => {
            const current = row.status ?? "absent";
            return (
              <div key={row.studentId} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar name={row.fullName} size="sm" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{row.fullName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {row.status === null
                        ? "Belgilanmagan"
                        : `${row.method ? METHOD_LABEL[row.method] : ""}${
                            row.markedAt && row.method !== "manual" ? ` · ${formatTimeUz(row.markedAt)}` : ""
                          }`}
                    </div>
                  </div>
                </div>

                <div
                  role="radiogroup"
                  aria-label={`${row.fullName} davomati`}
                  className={cn("grid grid-cols-4 gap-1.5 sm:w-[340px] shrink-0", pendingId === row.studentId && "opacity-70")}
                >
                  {ATTENDANCE_STATUS_ORDER.map((s) => {
                    const active = current === s && row.status !== null;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={pendingId === row.studentId}
                        onClick={() => setStatus(row, s)}
                        className={cn(
                          "min-h-[40px] rounded-lg text-[11px] font-bold border transition-colors cursor-pointer",
                          active
                            ? ATTENDANCE_STATUS_META[s].activeClassName
                            : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400"
                        )}
                      >
                        {ATTENDANCE_STATUS_META[s].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
