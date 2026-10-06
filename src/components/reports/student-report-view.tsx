"use client";

import { UserRound, Percent, Coins, Wallet, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { StatTile, ReportSection } from "@/components/reports/report-parts";
import { ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER } from "@/lib/attendance-status";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS } from "@/lib/homework-status";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDateUz, formatDateTimeUz } from "@/lib/utils";
import type { StudentReport } from "@/actions/report.actions";

const empty = (text: string) => <p className="py-6 text-center text-xs text-slate-400">{text}</p>;

export function StudentReportView({ report }: { report: StudentReport }) {
  const { student, attendance } = report;
  const lessons = attendance.records.length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        icon={UserRound}
        title={student.fullName}
        subtitle={`@${student.login} · ${student.groupName ?? "Guruhsiz"} · oxirgi kirish: ${
          student.lastLoginAt ? formatDateTimeUz(student.lastLoginAt) : "hali kirmagan"
        }`}
        backHref="/mentor/reports"
        backLabel="Hisobotlarga qaytish"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Percent} label="Davomat" value={attendance.percent === null ? "—" : `${attendance.percent}%`} />
        <StatTile icon={CalendarCheck} label="Darslar" value={lessons} hint={`${attendance.counts.absent} ta qoldirgan`} />
        <StatTile icon={Coins} label="Jami coin" value={student.totalCoins} hint="Reyting uchun" />
        <StatTile icon={Wallet} label="Balans" value={student.spendableBalance} hint="Sarflash mumkin" />
      </div>

      <ReportSection
        title="Davomat tarixi"
        onExport={() =>
          downloadCsv(
            `${student.login}_davomat.csv`,
            ["Sana", "Holat", "Izoh"],
            attendance.records.map((r) => [formatDateUz(r.date), ATTENDANCE_STATUS_META[r.status].label, r.notes])
          )
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {ATTENDANCE_STATUS_ORDER.map((s) => (
            <span key={s} className={cn("px-2 py-1 rounded-md text-[11px] font-bold", ATTENDANCE_STATUS_META[s].className)}>
              {ATTENDANCE_STATUS_META[s].label}: {attendance.counts[s]}
            </span>
          ))}
        </div>
        {lessons === 0 ? (
          empty("Hali davomat yozuvi yo'q")
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {attendance.records.map((r) => (
              <Link
                key={r.sessionId}
                href={`/mentor/attendance/${r.sessionId}`}
                title={`${formatDateUz(r.date)} — ${ATTENDANCE_STATUS_META[r.status].label}${r.notes ? ` (${r.notes})` : ""}`}
                className={cn(
                  "flex flex-col items-center justify-center w-14 h-12 rounded-xl text-[10px] font-semibold hover:ring-2 hover:ring-teal-500/40 transition-shadow",
                  ATTENDANCE_STATUS_META[r.status].className
                )}
              >
                <span className="text-sm font-black leading-none">{ATTENDANCE_STATUS_META[r.status].short}</span>
                <span className="mt-0.5 opacity-80">{formatDateUz(r.date).split(",")[0]}</span>
              </Link>
            ))}
          </div>
        )}
      </ReportSection>

      <ReportSection title="Uyga vazifalar">
        {report.homework.length === 0
          ? empty("Hali vazifa topshirmagan")
          : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {report.homework.map((h) => (
                <li key={h.lessonId} className="py-2 flex items-center justify-between gap-3">
                  <Link
                    href={`/mentor/homework/${h.lessonId}`}
                    className="min-w-0 truncate text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
                  >
                    {h.title}
                  </Link>
                  <span className="shrink-0 flex items-center gap-2">
                    {h.isLate && <Badge variant="danger">Kechikkan</Badge>}
                    {h.status === "graded" ? (
                      <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">{h.score} / 100</span>
                    ) : (
                      <Badge variant={HOMEWORK_STATE_BADGE[h.status]}>{HOMEWORK_STATE_LABELS[h.status]}</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </ReportSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportSection title="Testlar (quiz)">
          {report.quizzes.length === 0
            ? empty("Hali test topshirmagan")
            : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {report.quizzes.map((q, i) => (
                  <li key={i} className="py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{q.title}</span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {q.totalScore} / {q.maxScore}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </ReportSection>

        <ReportSection title="Imtihonlar">
          {report.exams.length === 0
            ? empty("Hali imtihon topshirmagan")
            : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {report.exams.map((e, i) => (
                  <li key={i} className="py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{e.title}</span>
                    <span className="shrink-0 flex items-center gap-2">
                      {e.status === "graded" ? (
                        <Badge variant={e.isPassed ? "success" : "danger"}>{e.isPassed ? "O'tdi" : "O'tmadi"}</Badge>
                      ) : (
                        <Badge variant="warning">Tekshirilmoqda</Badge>
                      )}
                      <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {e.totalScore} / {e.maxScore}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </ReportSection>

        <ReportSection
          title="Coin tarixi"
          description="Oxirgi 50 ta amal"
          onExport={() =>
            downloadCsv(
              `${student.login}_coinlar.csv`,
              ["Sana", "Miqdor", "Izoh"],
              report.ledger.map((l) => [l.createdAt ? formatDateTimeUz(l.createdAt) : "", l.amount, l.description])
            )
          }
        >
          {report.ledger.length === 0
            ? empty("Coin harakati yo'q")
            : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs max-h-80 overflow-y-auto pr-1">
                {report.ledger.map((l, i) => (
                  <li key={i} className="py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-700 dark:text-slate-200">{l.description}</span>
                      <span className="text-slate-400">{l.createdAt ? formatDateTimeUz(l.createdAt) : ""}</span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {l.amount > 0 ? "+" : ""}
                      {l.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </ReportSection>

        <ReportSection title="Do'kon buyurtmalari">
          {report.orders.length === 0
            ? empty("Buyurtma bermagan")
            : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {report.orders.map((o, i) => (
                  <li key={i} className="py-2 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-700 dark:text-slate-200">{o.productTitle}</span>
                      <span className="text-xs text-slate-400">
                        {o.createdAt ? formatDateUz(o.createdAt) : ""} · {o.price} coin
                      </span>
                    </span>
                    <Badge variant={ORDER_STATUS_BADGE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
        </ReportSection>
      </div>
    </div>
  );
}
