"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardCheck, Download, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  manualUpdateAttendanceAction,
  exportAttendanceCsvAction,
  finalizeAttendanceSessionAction,
  deleteAttendanceSessionAction,
  convertAttendanceRulesAction,
  SessionDetail,
  SessionRosterRow,
} from "@/actions/attendance.actions";
import { ATTENDANCE_COINS, ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER, formatCoinDelta } from "@/lib/attendance-status";
import { triggerDownload } from "@/lib/xlsx-client";
import { cn, formatDateUz, formatTimeUz } from "@/lib/utils";
import { UZ_WEEKDAYS, getTashkentParts } from "@/lib/schedule";
import type { AttendanceStatus } from "@/lib/db/models/attendance-record.model";

const METHOD_LABEL = { qr: "QR", code: "Kod", manual: "Qo'lda" } as const;

export function SessionDetailView({ detail }: { detail: SessionDetail }) {
  const { toast } = useToast();
  const router = useRouter();
  const rules = detail.session.coinRules;
  const [isFinalized, setIsFinalized] = useState(detail.session.isFinalized);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const groupHref = detail.group ? `/mentor/groups/${detail.group._id}/attendance` : "/mentor/groups";
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

  const handleFinalize = async () => {
    try {
      setIsFinalizing(true);
      const res = await finalizeAttendanceSessionAction(detail.session._id);
      if (res.success) {
        setIsFinalized(true);
        toast.success("Davomat yakunlandi");
        router.refresh();
      } else {
        toast.error(res.message || "Yakunlab bo'lmadi");
      }
    } catch {
      toast.error("Yakunlab bo'lmadi");
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleConvert = async () => {
    try {
      setIsConverting(true);
      const res = await convertAttendanceRulesAction(detail.session._id);
      if (res.success) {
        toast.success(res.message || "Yangi qoidaga o'tkazildi");
        setIsConvertOpen(false);
        router.refresh();
      } else {
        toast.error(res.message || "O'tkazib bo'lmadi");
      }
    } catch {
      toast.error("O'tkazib bo'lmadi");
    } finally {
      setIsConverting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const res = await deleteAttendanceSessionAction(detail.session._id);
      if (res.success) {
        toast.success(res.message || "Davomat o'chirildi");
        router.push(groupHref);
        router.refresh();
      } else {
        toast.error(res.message || "O'chirib bo'lmadi");
        setIsDeleting(false);
      }
    } catch {
      toast.error("O'chirib bo'lmadi");
      setIsDeleting(false);
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
    <div className="space-y-4 max-w-4xl mx-auto pb-12">
      <PageHeader
        icon={ClipboardCheck}
        title={`${detail.group?.name ?? "Guruh"} — ${formatDateUz(detail.session.date)}`}
        subtitle={`${weekday}, ${formatTimeUz(detail.session.startTime)}${
          detail.session.endTime ? `–${formatTimeUz(detail.session.endTime)}` : ""
        } · coin: ${ATTENDANCE_STATUS_ORDER.map((st) => `${ATTENDANCE_STATUS_META[st].label.toLowerCase()} ${formatCoinDelta(rules[st])}`).join(", ")}`}
        backHref={groupHref}
        backLabel="Guruh davomatiga qaytish"
        actions={
          <>
            <Button variant="secondary" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={() => setIsDeleteOpen(true)} className="gap-2 text-rose-700 dark:text-rose-400">
              <Trash2 className="w-4 h-4" />
              O&apos;chirish
            </Button>
          </>
        }
      />

      {/* Eski qoidada olingan dars */}
      {detail.session.isLegacyRules && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface px-4 py-3">
          <div className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-slate-100">Bu dars eski coin qoidasida olingan</span> (qatnashganga{" "}
            {formatCoinDelta(rules.present)}, jarimasiz). Joriy qoida:{" "}
            {ATTENDANCE_STATUS_ORDER.map((st) => `${ATTENDANCE_STATUS_META[st].label.toLowerCase()} ${formatCoinDelta(ATTENDANCE_COINS[st])}`).join(", ")}.
          </div>
          <Button variant="secondary" onClick={() => setIsConvertOpen(true)} className="shrink-0">
            Yangi qoidaga o&apos;tkazish
          </Button>
        </div>
      )}

      {/* Qo'lda kiritilgan dars: jarima mentor belgilab bo'lgach qo'llanadi */}
      {!isFinalized && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-500/50 bg-amber-50 dark:bg-amber-500/10 p-4">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">
            <span className="font-bold">Davomat hali yakunlanmagan.</span> Kelganlarni belgilab chiqing, so&apos;ng yakunlang:
            shunda &quot;kelmagan&quot; bo&apos;lib qolganlardan {formatCoinDelta(rules.absent)} coin olinadi.
          </div>
          <Button variant="primary" onClick={handleFinalize} isLoading={isFinalizing} className="shrink-0 min-h-[44px]">
            Davomatni yakunlash
          </Button>
        </div>
      )}

      {/* Xulosa */}
      <div className="px-4 py-3 rounded-2xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100 tabular-nums">{percent}%</div>
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
              <div key={row.studentId} className="px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
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
                          "min-h-[44px] rounded-lg text-[11px] font-bold border transition-colors cursor-pointer",
                          active
                            ? ATTENDANCE_STATUS_META[s].activeClassName
                            : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400"
                        )}
                      >
                        <span className="block leading-tight">{ATTENDANCE_STATUS_META[s].label}</span>
                        <span className={cn("block font-mono text-[10px] leading-tight", active ? "opacity-90" : "opacity-70")}>
                          {formatCoinDelta(rules[s])}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={isConvertOpen}
        onClose={() => setIsConvertOpen(false)}
        onConfirm={handleConvert}
        title="Yangi coin qoidasiga o'tkazish"
        description={
          <>
            Shu darsdagi har bir o&apos;quvchining coini joriy qoida bo&apos;yicha qayta hisoblanadi: kelganlarniki{" "}
            {formatCoinDelta(rules.present)} dan {formatCoinDelta(ATTENDANCE_COINS.present)} ga tushadi, kelmaganlardan{" "}
            {formatCoinDelta(ATTENDANCE_COINS.absent)} olinadi (balans 0 dan pastga tushmaydi). O&apos;quvchilarga xabar yuborilmaydi.
            Ortga qaytarib bo&apos;lmaydi.
          </>
        }
        confirmText="Ha, o'tkazish"
        isLoading={isConverting}
      />

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Davomatni o'chirish"
        description={
          <>
            <strong>{detail.group?.name}</strong> guruhining {formatDateUz(detail.session.date)} kungi davomati butunlay
            o&apos;chiriladi. Shu dars uchun berilgan coinlar qaytarib olinadi, olingan jarimalar esa o&apos;quvchilarga
            qaytariladi. Bu amalni ortga qaytarib bo&apos;lmaydi.
          </>
        }
        confirmText="Ha, o'chirish"
        danger
        isLoading={isDeleting}
      />
    </div>
  );
}