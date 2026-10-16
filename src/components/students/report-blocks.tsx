"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Coins, Wallet, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ReportSection, ScoreBar, StatTile } from "@/components/reports/report-parts";
import type { StudentReport } from "@/actions/report.actions";
import type { StudentActivityItem } from "@/actions/student-profile.actions";
import { ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER, formatCoinDelta } from "@/lib/attendance-status";
import { COIN_TYPE_COLORS, COIN_TYPE_LABELS } from "@/lib/coin-types";
import { HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS } from "@/lib/homework-status";
import { ORDER_STATUS_BADGE, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { SCORE_TONE, scoreTone } from "@/lib/score-tone";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDateTimeUz, formatDateUz, formatNumberUz } from "@/lib/utils";
import type { CoinTransactionType } from "@/lib/db/models/coin-ledger.model";

// O'quvchi hisobotining bloklari: mentorning o'quvchi sahifasi va o'quvchining o'z profili bir xil ko'rinishda.

export const emptyNote = (text: string) => <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">{text}</p>;
export const percentOf = (score: number, max: number) => (max > 0 ? Math.round((score / max) * 100) : null);
export const average = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);

/** Uyga vazifa, test va imtihonlarning o'rtacha natijalari */
export function reportAverages(report: StudentReport) {
  return {
    homeworkAvg: average(report.homework.filter((h) => h.status === "graded" && h.score !== null).map((h) => h.score as number)),
    quizAvg: average(report.quizzes.flatMap((q) => percentOf(q.totalScore, q.maxScore) ?? [])),
    examAvg: average(report.exams.filter((e) => e.isMain && e.status === "graded").flatMap((e) => percentOf(e.totalScore, e.maxScore) ?? [])),
  };
}

const TONE_DOT: Record<StudentActivityItem["tone"], string> = {
  success: "bg-emerald-500",
  teal: "bg-teal-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  default: "bg-slate-400",
};

/** Faoliyat tasmasi: davomat, topshiriqlar va xaridlar (+ qo'shimcha yozuvlar) — yangisidan eskisiga */
export function buildActivity(report: StudentReport, extra: StudentActivityItem[] = []): StudentActivityItem[] {
  const items: StudentActivityItem[] = [...extra];
  for (const r of report.attendance.records) {
    items.push({
      at: r.date,
      label: `Davomat: ${ATTENDANCE_STATUS_META[r.status].label}`,
      detail: r.notes,
      tone: r.status === "present" ? "success" : r.status === "absent" ? "danger" : "warning",
    });
  }
  for (const h of report.homework) {
    if (!h.submittedAt) continue;
    items.push({
      at: h.submittedAt,
      label: h.status === "graded" ? `Vazifa baholandi: ${h.score} ball` : "Vazifa topshirildi",
      detail: h.title + (h.isLate ? " · kechikib" : ""),
      tone: h.isLate ? "warning" : "teal",
    });
  }
  for (const q of report.quizzes) {
    if (!q.submittedAt) continue;
    items.push({ at: q.submittedAt, label: `Test topshirildi: ${q.totalScore} / ${q.maxScore}`, detail: q.title, tone: "teal" });
  }
  for (const e of report.exams) {
    if (!e.submittedAt) continue;
    items.push({
      at: e.submittedAt,
      label: `Imtihon topshirildi: ${e.totalScore} / ${e.maxScore}`,
      detail: e.title,
      tone: e.status === "graded" ? (e.isPassed ? "success" : "danger") : "teal",
    });
  }
  for (const o of report.orders) {
    if (!o.createdAt) continue;
    items.push({
      at: o.createdAt,
      label: `Do'kondan buyurtma: ${o.productTitle}`,
      detail: `${o.price} coin · ${ORDER_STATUS_LABELS[o.status]}`,
      tone: "default",
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 150);
}

const PAGE = 30;

export function ActivityTimeline({ items, description }: { items: StudentActivityItem[]; description?: string }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <ReportSection title="Faoliyat tarixi" description={description}>
      {items.length === 0 ? (
        emptyNote("Hali faoliyat yo'q")
      ) : (
        <>
          <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-800 space-y-4 py-1">
            {items.slice(0, shown).map((a, i) => (
              <li key={i} className="relative pl-5">
                <span className={cn("absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-surface", TONE_DOT[a.tone])} />
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">{a.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                  {formatDateTimeUz(a.at)}
                  {a.detail ? ` · ${a.detail}` : ""}
                </p>
              </li>
            ))}
          </ol>
          <ShowMore shown={shown} total={items.length} onMore={() => setShown((n) => n + PAGE)} />
        </>
      )}
    </ReportSection>
  );
}

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <button
      type="button"
      onClick={onMore}
      className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition-colors"
    >
      Yana ko&apos;rsatish ({total - shown})
    </button>
  );
}

type LedgerFilter = "all" | "in" | "out";

/** Coinlar: manbalar bo'yicha kirim-chiqim va to'liq tarix (filtr, CSV) */
export function CoinHistory({
  ledger,
  balance,
  csvName,
  title = "Coinlar tarixi",
}: {
  ledger: StudentReport["ledger"];
  balance: number;
  csvName: string;
  title?: string;
}) {
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [type, setType] = useState<CoinTransactionType | "">("");
  const [shown, setShown] = useState(PAGE);

  const stats = useMemo(() => {
    let earned = 0;
    let lost = 0;
    const byType = new Map<CoinTransactionType, { plus: number; minus: number }>();
    for (const l of ledger) {
      if (l.amount >= 0) earned += l.amount;
      else lost += -l.amount;
      const t = byType.get(l.type) ?? { plus: 0, minus: 0 };
      if (l.amount >= 0) t.plus += l.amount;
      else t.minus += -l.amount;
      byType.set(l.type, t);
    }
    return { earned, lost, byType: [...byType.entries()].sort((a, b) => b[1].plus + b[1].minus - (a[1].plus + a[1].minus)) };
  }, [ledger]);

  const rows = ledger.filter(
    (l) => (filter === "all" || (filter === "in" ? l.amount > 0 : l.amount < 0)) && (!type || l.type === type)
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile icon={Coins} label="Olingan" value={`+${formatNumberUz(stats.earned)}`} tone="good" />
        <StatTile
          icon={Coins}
          label="Yechilgan / sarflangan"
          value={stats.lost === 0 ? "0" : `−${formatNumberUz(stats.lost)}`}
          tone={stats.lost > 0 ? "low" : "none"}
        />
        <div className="col-span-2 sm:col-span-1">
          <StatTile icon={Wallet} label="Hozirgi balans" value={formatNumberUz(balance)} />
        </div>
      </div>

      <ReportSection title="Nima uchun olingan va nimaga ketgan" description="Manbalar bo'yicha (oxirgi 300 ta amal)">
        {stats.byType.length === 0 ? (
          emptyNote("Coin harakati yo'q")
        ) : (
          <ul className="space-y-2.5">
            {stats.byType.map(([t, v]) => {
              const total = Math.max(1, stats.earned + stats.lost);
              return (
                <li key={t} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{COIN_TYPE_LABELS[t]}</span>
                    <span className="font-bold tabular-nums">
                      {v.plus > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{v.plus}</span>}
                      {v.plus > 0 && v.minus > 0 && <span className="text-slate-400"> · </span>}
                      {v.minus > 0 && <span className="text-rose-700 dark:text-rose-400">−{v.minus}</span>}
                    </span>
                  </div>
                  <div className="flex h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={cn("h-full", COIN_TYPE_COLORS[t].bar)} style={{ width: `${(v.plus / total) * 100}%` }} />
                    <div className="h-full bg-rose-500/70" style={{ width: `${(v.minus / total) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ReportSection>

      <ReportSection
        title={title}
        description={`${rows.length} ta amal`}
        onExport={() =>
          downloadCsv(
            `${csvName}_coinlar.csv`,
            ["Sana", "Manba", "Sabab", "Miqdor", "Balans"],
            rows.map((l) => [l.createdAt ? formatDateTimeUz(l.createdAt) : "", COIN_TYPE_LABELS[l.type], l.description, l.amount, l.balanceAfter ?? ""])
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["all", "Hammasi"],
              ["in", "Olingan"],
              ["out", "Yechilgan"],
            ] as [LedgerFilter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setShown(PAGE);
              }}
              className={cn(
                "px-3 min-h-[36px] rounded-lg text-xs font-semibold cursor-pointer transition-colors",
                filter === id
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              )}
            >
              {label}
            </button>
          ))}
          <select
            aria-label="Manba"
            value={type}
            onChange={(e) => {
              setType(e.target.value as CoinTransactionType | "");
              setShown(PAGE);
            }}
            className="ml-auto px-3 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-bg text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="">Barcha manbalar</option>
            {stats.byType.map(([t]) => (
              <option key={t} value={t}>
                {COIN_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {rows.length === 0 ? (
          emptyNote("Bu filtr bo'yicha amal yo'q")
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.slice(0, shown).map((l, i) => (
                <li key={i} className="py-2.5 flex items-center gap-3">
                  <span
                    className={cn(
                      "shrink-0 w-14 text-center py-1 rounded-lg text-sm font-black tabular-nums",
                      l.amount > 0 ? SCORE_TONE.good.soft : l.amount < 0 ? SCORE_TONE.low.soft : SCORE_TONE.none.soft
                    )}
                  >
                    {formatCoinDelta(l.amount)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800 dark:text-slate-200 break-words">{l.description}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className={cn("px-1.5 py-0.5 rounded-md font-semibold", COIN_TYPE_COLORS[l.type].soft)}>{COIN_TYPE_LABELS[l.type]}</span>
                      {l.createdAt && <span>{formatDateTimeUz(l.createdAt)}</span>}
                    </span>
                  </span>
                  {l.balanceAfter !== null && (
                    <span className="shrink-0 text-right text-[11px] text-slate-500 dark:text-slate-400">
                      balans
                      <span className="block text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">{l.balanceAfter}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <ShowMore shown={shown} total={rows.length} onMore={() => setShown((n) => n + PAGE)} />
          </>
        )}
      </ReportSection>
    </div>
  );
}

/** XP tarixi: har bir amal qancha tajriba bergani */
export function XpHistory({ rows, xp }: { rows: StudentReport["xpHistory"]; xp: number }) {
  const [shown, setShown] = useState(PAGE);
  const byType = useMemo(() => {
    const m = new Map<CoinTransactionType, number>();
    for (const r of rows) m.set(r.type, (m.get(r.type) ?? 0) + r.xp);
    return [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const total = Math.max(1, byType.reduce((s, [, v]) => s + v, 0));

  return (
    <div className="space-y-4">
      <ReportSection title="XP qayerdan keldi" description={`Jami: ${formatNumberUz(xp)} XP. XP hech qachon sarflanmaydi, darajangiz shunga qarab o'sadi`}>
        {byType.length === 0 ? (
          emptyNote("Hali XP yo'q")
        ) : (
          <ul className="space-y-2.5">
            {byType.map(([t, v]) => (
              <li key={t} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t === "xp_align" ? "Boshlang'ich XP" : COIN_TYPE_LABELS[t]}
                  </span>
                  <span className="font-bold tabular-nums text-teal-700 dark:text-teal-300">+{formatNumberUz(v)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className={cn("h-full", COIN_TYPE_COLORS[t].bar)} style={{ width: `${(v / total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <ReportSection title="XP tarixi" description={`${rows.length} ta amal`}>
        {rows.length === 0 ? (
          emptyNote("Hali XP harakati yo'q")
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.slice(0, shown).map((r, i) => (
                <li key={i} className="py-2.5 flex items-center gap-3">
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center justify-center gap-0.5 min-w-14 px-1.5 py-1 rounded-lg text-sm font-black tabular-nums",
                      r.xp > 0 ? "bg-teal-500/10 text-teal-700 dark:text-teal-300" : SCORE_TONE.low.soft
                    )}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {r.xp > 0 ? `+${r.xp}` : `−${-r.xp}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-800 dark:text-slate-200 break-words">{r.description}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className={cn("px-1.5 py-0.5 rounded-md font-semibold", COIN_TYPE_COLORS[r.type].soft)}>
                        {r.type === "xp_align" ? "Boshlang'ich" : COIN_TYPE_LABELS[r.type]}
                      </span>
                      {r.createdAt && <span>{formatDateTimeUz(r.createdAt)}</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <ShowMore shown={shown} total={rows.length} onMore={() => setShown((n) => n + PAGE)} />
          </>
        )}
      </ReportSection>
    </div>
  );
}

export function OrdersList({ orders }: { orders: StudentReport["orders"] }) {
  return (
    <ReportSection title="Do'kon buyurtmalari">
      {orders.length === 0 ? (
        emptyNote("Buyurtma yo'q")
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {orders.map((o, i) => (
            <li key={i} className="py-2 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-slate-700 dark:text-slate-200">{o.productTitle}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {o.createdAt ? formatDateUz(o.createdAt) : ""} · {o.price} coin
                </span>
              </span>
              <Badge variant={ORDER_STATUS_BADGE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  );
}

/** Davomat: foiz, holatlar soni va har bir dars katakchasi (mentorda katakcha dars davomatiga olib boradi) */
export function AttendancePanel({
  attendance,
  sessionHref,
  onExport,
}: {
  attendance: StudentReport["attendance"];
  sessionHref?: (sessionId: string) => string;
  onExport?: () => void;
}) {
  const cell = "flex flex-col items-center justify-center w-14 h-12 rounded-xl text-[10px] font-semibold";
  return (
    <ReportSection
      title="Davomat"
      description={sessionHref ? "Katakcha ustiga bosilsa o'sha dars davomati ochiladi" : "Har bir katakcha — bitta dars"}
      onExport={onExport}
    >
      <ScoreBar percent={attendance.percent} label="Qatnashish ulushi (sababli qoldirilganlar hisobga olinmaydi)" />
      <div className="flex flex-wrap gap-1.5">
        {ATTENDANCE_STATUS_ORDER.map((s) => (
          <span key={s} className={cn("px-2 py-1 rounded-md text-[11px] font-bold", ATTENDANCE_STATUS_META[s].className)}>
            {ATTENDANCE_STATUS_META[s].label}: {attendance.counts[s]}
          </span>
        ))}
      </div>
      {attendance.records.length === 0 ? (
        emptyNote("Hali davomat yozuvi yo'q")
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {attendance.records.map((r) => {
            const title = `${formatDateUz(r.date)} — ${ATTENDANCE_STATUS_META[r.status].label}${r.notes ? ` (${r.notes})` : ""}`;
            const inner = (
              <>
                <span className="text-sm font-black leading-none">{ATTENDANCE_STATUS_META[r.status].short}</span>
                <span className="mt-0.5 opacity-80">{formatDateUz(r.date).split(",")[0]}</span>
              </>
            );
            return sessionHref ? (
              <Link
                key={r.sessionId}
                href={sessionHref(r.sessionId)}
                title={title}
                className={cn(cell, "hover:ring-2 hover:ring-teal-500/40 transition-shadow", ATTENDANCE_STATUS_META[r.status].className)}
              >
                {inner}
              </Link>
            ) : (
              <span key={r.sessionId} title={title} className={cn(cell, ATTENDANCE_STATUS_META[r.status].className)}>
                {inner}
              </span>
            );
          })}
        </div>
      )}
    </ReportSection>
  );
}

/** Uyga vazifa, test va imtihon natijalari */
export function GradesPanel({ report, homeworkHref }: { report: StudentReport; homeworkHref: (lessonId: string) => string }) {
  const { homeworkAvg, quizAvg, examAvg } = reportAverages(report);
  return (
    <div className="space-y-4">
      <ReportSection title="Uyga vazifalar" description={homeworkAvg === null ? undefined : `O'rtacha ball: ${homeworkAvg} / 100`}>
        {report.homework.length === 0 ? (
          emptyNote("Hali vazifa topshirilmagan")
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {report.homework.map((h) => (
              <li key={h.lessonId} className="py-2 flex items-center justify-between gap-3">
                <Link
                  href={homeworkHref(h.lessonId)}
                  className="min-w-0 truncate py-1.5 text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
                >
                  {h.title}
                </Link>
                <span className="shrink-0 flex items-center gap-2">
                  {h.isLate && <Badge variant="danger">Kechikkan</Badge>}
                  {h.status === "graded" && h.score !== null ? (
                    <ScorePill percent={h.score} text={`${h.score} / 100`} />
                  ) : (
                    <Badge variant={HOMEWORK_STATE_BADGE[h.status]}>{HOMEWORK_STATE_LABELS[h.status]}</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ReportSection>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title="Testlar (quiz)" description={quizAvg === null ? undefined : `O'rtacha natija: ${quizAvg}%`}>
          {report.quizzes.length === 0 ? (
            emptyNote("Hali test topshirilmagan")
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {report.quizzes.map((q, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{q.title}</span>
                  <ScorePill percent={percentOf(q.totalScore, q.maxScore)} text={`${q.totalScore} / ${q.maxScore}`} />
                </li>
              ))}
            </ul>
          )}
        </ReportSection>

        <ReportSection title="Imtihonlar" description={examAvg === null ? undefined : `O'rtacha natija: ${examAvg}%`}>
          {report.exams.length === 0 ? (
            emptyNote("Hali imtihon topshirilmagan")
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {report.exams.map((e, i) => (
                <li key={i} className="py-2 flex items-center justify-between gap-3">
                  <span className={cn("min-w-0 truncate text-slate-700 dark:text-slate-200", !e.isMain && "opacity-60")}>
                    {e.title}
                    {(e.attemptNumber > 1 || !e.isMain) && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {" "}
                        · {e.attemptNumber}-urinish{e.isMain ? "" : " (oldingi)"}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 flex items-center gap-2">
                    {e.status === "graded" ? (
                      <Badge variant={e.isPassed ? "success" : "danger"}>{e.isPassed ? "O'tdi" : "O'tmadi"}</Badge>
                    ) : (
                      <Badge variant="warning">Tekshirilmoqda</Badge>
                    )}
                    <ScorePill percent={e.status === "graded" ? percentOf(e.totalScore, e.maxScore) : null} text={`${e.totalScore} / ${e.maxScore}`} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ReportSection>
      </div>
    </div>
  );
}

export function ScorePill({ percent, text }: { percent: number | null; text: string }) {
  return (
    <span className={cn("shrink-0 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums", SCORE_TONE[scoreTone(percent)].soft)}>
      {text}
    </span>
  );
}
