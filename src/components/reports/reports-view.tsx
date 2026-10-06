"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Users, CalendarCheck, Percent, Coins, ShoppingBag, PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile, ReportSection, BarList } from "@/components/reports/report-parts";
import { ATTENDANCE_STATUS_META, ATTENDANCE_STATUS_ORDER } from "@/lib/attendance-status";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDateUz } from "@/lib/utils";
import { dateFromKey } from "@/lib/schedule";
import type { ReportData } from "@/actions/report.actions";

const PERIODS = [
  { id: "week", label: "7 kun" },
  { id: "month", label: "30 kun" },
  { id: "quarter", label: "90 kun" },
  { id: "year", label: "O'quv yili" },
  { id: "custom", label: "Boshqa" },
];

const COIN_TYPE_LABELS: Record<string, string> = {
  attendance: "Davomat",
  quiz: "Testlar",
  exam: "Imtihonlar",
  bonus: "Bonus",
  purchase: "Do'kon xaridlari",
  adjustment: "Tuzatishlar",
};

interface ReportsViewProps {
  data: ReportData | null;
  groups: { _id: string; name: string }[];
  period: string;
  groupId: string;
}

export function ReportsView({ data, groups, period, groupId }: ReportsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(period === "custom");
  const [from, setFrom] = useState(data?.range.from ?? "");
  const [to, setTo] = useState(data?.range.to ?? "");

  const navigate = (next: { period?: string; group?: string; from?: string; to?: string }) => {
    const p = next.period ?? period;
    const g = next.group ?? groupId;
    const query = new URLSearchParams();
    query.set("period", p);
    if (g) query.set("group", g);
    if (p === "custom") {
      query.set("from", next.from ?? from);
      query.set("to", next.to ?? to);
    }
    // Filtr almashganda eski ma'lumot xiralashib turadi, sahifa "sakramaydi"
    startTransition(() => router.replace(`${pathname}?${query.toString()}`, { scroll: false }));
  };

  const rangeLabel = data ? `${formatDateUz(dateFromKey(data.range.from, "12:00"))} — ${formatDateUz(dateFromKey(data.range.to, "12:00"))}` : "";
  const suffix = data ? `${data.range.from}_${data.range.to}` : "";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader icon={BarChart3} title="Hisobotlar" subtitle={rangeLabel || "Davomat, o'zlashtirish, coinlar va do'kon"} />

      {/* Filtrlar: barcha bo'limlarga bir xil ta'sir qiladi */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div role="group" aria-label="Davr" className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/60 overflow-x-auto">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => {
                  if (p.id === "custom") setCustomOpen(true);
                  else {
                    setCustomOpen(false);
                    navigate({ period: p.id });
                  }
                }}
                className={cn(
                  "px-3.5 min-h-[40px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer",
                  (p.id === "custom" ? customOpen : period === p.id && !customOpen)
                    ? "bg-white dark:bg-[#131E32] text-teal-700 dark:text-teal-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="sm:w-56 sm:ml-auto">
            <Select aria-label="Guruh" value={groupId} onChange={(e) => navigate({ group: e.target.value })}>
              <option value="">Barcha guruhlar</option>
              {groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {customOpen && (
          <form
            className="flex flex-wrap items-end gap-2 page-enter"
            onSubmit={(e) => {
              e.preventDefault();
              if (from && to && from <= to) navigate({ period: "custom", from, to });
            }}
          >
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 space-y-1">
              <span className="block">Dan</span>
              <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 space-y-1">
              <span className="block">Gacha</span>
              <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} required />
            </label>
            <Button type="submit" variant="primary" isLoading={isPending}>
              Ko&apos;rsatish
            </Button>
          </form>
        )}
      </div>

      {!data ? (
        <EmptyState icon={BarChart3} title="Hisobotni yuklab bo'lmadi" description="Davr yoki guruhni qayta tanlang" />
      ) : (
        <div
          aria-busy={isPending}
          className={cn("space-y-6 transition-opacity duration-200", isPending && "opacity-50 pointer-events-none")}
        >
          {/* Umumiy ko'rsatkichlar */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatTile icon={Users} label="O'quvchilar" value={data.overview.students} />
            <StatTile icon={CalendarCheck} label="O'tilgan darslar" value={data.overview.lessonsHeld} hint="Davomati olingan" />
            <StatTile
              icon={Percent}
              label="O'rtacha davomat"
              value={data.overview.attendancePercent === null ? "—" : `${data.overview.attendancePercent}%`}
            />
            <StatTile icon={Coins} label="Berilgan coinlar" value={data.overview.coinsEarned.toLocaleString("ru-RU")} />
            <StatTile icon={ShoppingBag} label="Do'konda sarflangan" value={data.overview.coinsSpent.toLocaleString("ru-RU")} hint="coin" />
            <StatTile icon={PackageCheck} label="Kutilayotgan buyurtmalar" value={data.overview.pendingOrders} hint="Hozirgi holat" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportSection
              title="Guruhlar bo'yicha davomat"
              description="Qatnashganlar ulushi (sababli qoldirilganlar hisobga olinmaydi)"
              onExport={() =>
                downloadCsv(
                  `davomat_guruhlar_${suffix}.csv`,
                  ["Guruh", "Darslar", "Kelgan", "Kechikkan", "Sababli", "Kelmagan", "Davomat %"],
                  data.attendanceByGroup.map((g) => [g.name, g.lessons, g.present, g.late, g.excused, g.absent, g.percent ?? ""])
                )
              }
            >
              <BarList
                max={100}
                items={data.attendanceByGroup
                  .filter((g) => g.lessons > 0)
                  .map((g) => ({
                    key: g.groupId,
                    label: g.name,
                    sub: `${g.lessons} dars`,
                    value: g.percent,
                    display: g.percent === null ? "—" : `${g.percent}%`,
                  }))}
              />
              {data.attendanceByGroup.some((g) => g.lessons > 0) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ATTENDANCE_STATUS_ORDER.map((s) => (
                    <span key={s} className={cn("px-2 py-1 rounded-md text-[11px] font-bold", ATTENDANCE_STATUS_META[s].className)}>
                      {ATTENDANCE_STATUS_META[s].label}: {data.attendanceByGroup.reduce((acc, g) => acc + g[s], 0)}
                    </span>
                  ))}
                </div>
              )}
            </ReportSection>

            <ReportSection
              title="Eng ko'p dars qoldirganlar"
              description="Sababsiz qoldirilgan darslar soni bo'yicha"
              onExport={() =>
                downloadCsv(
                  `dars_qoldirganlar_${suffix}.csv`,
                  ["O'quvchi", "Guruh", "Qoldirgan", "Jami dars", "Davomat %"],
                  data.mostAbsent.map((s) => [s.fullName, s.groupName, s.absent, s.total, s.percent ?? ""])
                )
              }
            >
              <BarList
                emptyText="Bu davrda hech kim dars qoldirmagan 🎉"
                items={data.mostAbsent.map((s) => ({
                  key: s.studentId,
                  label: (
                    <Link href={`/mentor/reports/students/${s.studentId}`} className="hover:underline">
                      {s.fullName}
                    </Link>
                  ),
                  sub: s.groupName,
                  value: s.absent,
                  display: `${s.absent} / ${s.total}`,
                }))}
              />
            </ReportSection>
          </div>

          <ReportSection
            title="Darslar kesimida davomat"
            description="Har bir ustun — bitta dars. Ustiga bosilsa o'sha dars davomati ochiladi"
            onExport={() =>
              downloadCsv(
                `davomat_darslar_${suffix}.csv`,
                ["Sana", "Guruh", "Qatnashgan", "Jami", "Davomat %"],
                data.attendanceByLesson.map((l) => [l.dateKey, l.groupName, l.attended, l.total, l.percent ?? ""])
              )
            }
          >
            {data.attendanceByLesson.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Bu davrda davomat olinmagan</p>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="flex items-end gap-0.5 h-40 min-w-max border-b border-slate-200 dark:border-slate-700">
                  {data.attendanceByLesson.map((l) => (
                    <Link
                      key={l.sessionId}
                      href={`/mentor/attendance/${l.sessionId}`}
                      title={`${l.groupName} · ${formatDateUz(dateFromKey(l.dateKey, "12:00"))} — ${l.percent ?? 0}% (${l.attended}/${l.total})`}
                      className="group flex flex-col justify-end items-center w-6 h-full px-0.5"
                    >
                      <span className="text-[9px] font-bold tabular-nums text-slate-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                        {l.percent ?? 0}
                      </span>
                      <span
                        className="w-full rounded-t-[4px] bg-teal-600 dark:bg-teal-400 group-hover:bg-teal-700 dark:group-hover:bg-teal-300 transition-colors"
                        style={{ height: `${Math.max(3, l.percent ?? 0)}%` }}
                      />
                    </Link>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 min-w-max">
                  <span>{formatDateUz(dateFromKey(data.attendanceByLesson[0].dateKey, "12:00"))}</span>
                  <span>{formatDateUz(dateFromKey(data.attendanceByLesson[data.attendanceByLesson.length - 1].dateKey, "12:00"))}</span>
                </div>
              </div>
            )}
          </ReportSection>

          <div className="grid gap-6 lg:grid-cols-2">
            <ReportSection
              title="Testlar (quiz) natijalari"
              description="Guruhlar bo'yicha o'rtacha natija"
              onExport={() =>
                downloadCsv(
                  `testlar_${suffix}.csv`,
                  ["Guruh", "Topshirilgan testlar", "O'rtacha %"],
                  data.quizzesByGroup.map((q) => [q.name, q.submissions, q.avgPercent ?? ""])
                )
              }
            >
              <BarList
                max={100}
                emptyText="Bu davrda test topshirilmagan"
                items={data.quizzesByGroup
                  .filter((q) => q.submissions > 0)
                  .map((q) => ({
                    key: q.groupId,
                    label: q.name,
                    sub: `${q.submissions} ta topshiriq`,
                    value: q.avgPercent,
                    display: q.avgPercent === null ? "—" : `${q.avgPercent}%`,
                  }))}
              />
            </ReportSection>

            <ReportSection
              title="Imtihonlar"
              description="O'rtacha ball va o'tganlar ulushi (baholanganlar bo'yicha)"
              onExport={() =>
                downloadCsv(
                  `imtihonlar_${suffix}.csv`,
                  ["Imtihon", "Topshirganlar", "O'rtacha %", "O'tganlar %"],
                  data.exams.map((e) => [e.title, e.submissions, e.avgPercent ?? "", e.passPercent ?? ""])
                )
              }
            >
              <BarList
                max={100}
                emptyText="Bu davrda imtihon topshirilmagan"
                items={data.exams.map((e) => ({
                  key: e.examId,
                  label: e.title,
                  sub: `${e.submissions} ta · o'tgan ${e.passPercent === null ? "—" : `${e.passPercent}%`}`,
                  value: e.avgPercent,
                  display: e.avgPercent === null ? "Baholanmagan" : `${e.avgPercent}%`,
                }))}
              />
            </ReportSection>

            <ReportSection
              title="Eng ko'p coin to'plaganlar"
              description="Tanlangan davrda topilgan coinlar"
              onExport={() =>
                downloadCsv(
                  `top_coin_${suffix}.csv`,
                  ["O'quvchi", "Guruh", "Coin"],
                  data.topEarners.map((s) => [s.fullName, s.groupName, s.earned])
                )
              }
            >
              <BarList
                emptyText="Bu davrda coin berilmagan"
                items={data.topEarners.map((s) => ({
                  key: s.studentId,
                  label: (
                    <Link href={`/mentor/reports/students/${s.studentId}`} className="hover:underline">
                      {s.fullName}
                    </Link>
                  ),
                  sub: s.groupName,
                  value: s.earned,
                  display: String(s.earned),
                }))}
              />
            </ReportSection>

            <ReportSection
              title="Coinlar harakati"
              description="Manba bo'yicha jami (manfiy son — sarflangan)"
              onExport={() =>
                downloadCsv(
                  `coinlar_${suffix}.csv`,
                  ["Manba", "Coin"],
                  data.coinsByType.map((c) => [COIN_TYPE_LABELS[c.type] ?? c.type, c.amount])
                )
              }
            >
              {data.coinsByType.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">Bu davrda coin harakati yo&apos;q</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.coinsByType.map((c) => (
                      <tr key={c.type}>
                        <td className="py-2 text-slate-700 dark:text-slate-200">{COIN_TYPE_LABELS[c.type] ?? c.type}</td>
                        <td className="py-2 text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {c.amount > 0 ? "+" : ""}
                          {c.amount.toLocaleString("ru-RU")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ReportSection>

            <ReportSection
              title="Do'kon: mashhur mahsulotlar"
              description="Buyurtmalar soni (bekor qilinganlarsiz)"
              onExport={() =>
                downloadCsv(
                  `dokon_${suffix}.csv`,
                  ["Mahsulot", "Buyurtmalar", "Coin"],
                  data.topProducts.map((p) => [p.title, p.count, p.coins])
                )
              }
            >
              <BarList
                emptyText="Bu davrda buyurtma bo'lmagan"
                items={data.topProducts.map((p) => ({
                  key: p.title,
                  label: p.title,
                  sub: `${p.coins} coin`,
                  value: p.count,
                  display: `${p.count} ta`,
                }))}
              />
            </ReportSection>

            <ReportSection title="Do'kon: buyurtmalar holati" description="Tanlangan davrda berilgan buyurtmalar">
              <BarList
                emptyText="Bu davrda buyurtma bo'lmagan"
                items={data.ordersByStatus.map((o) => ({
                  key: o.status,
                  label: ORDER_STATUS_LABELS[o.status],
                  value: o.count,
                  display: `${o.count} ta`,
                }))}
              />
            </ReportSection>
          </div>
        </div>
      )}
    </div>
  );
}
