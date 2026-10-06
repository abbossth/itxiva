import Link from "next/link";
import { BookOpen, CalendarClock, ClipboardCheck, PackageCheck, Plus, QrCode, Users } from "lucide-react";
import type { MentorDashboard } from "@/actions/dashboard.actions";
import { Badge } from "@/components/ui/badge";
import { CoinBadge } from "@/components/ui/coin-badge";
import { buttonVariants } from "@/components/ui/button";
import { DashCard, DashEmpty, Greeting, StatLink } from "@/components/dashboard/dashboard-parts";

export function MentorDashboardView({ data }: { data: MentorDashboard }) {
  const todayGroups = data.groups.filter((g) => g.hasLessonToday);
  const subtitle =
    todayGroups.length > 0
      ? `Bugun ${todayGroups.length} ta guruhda dars bor`
      : "Bugun jadval bo'yicha dars yo'q";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Greeting name={data.firstName} subtitle={subtitle} />
        <Link href="/mentor/lessons/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
          <Plus className="w-4 h-4" />
          Yangi dars
        </Link>
      </div>

      {data.activeSessions.map((s) => (
        <Link
          key={s._id}
          href={`/mentor/attendance/${s._id}`}
          className="stagger-item flex items-center gap-3 rounded-2xl border border-teal-500/50 bg-teal-50 dark:bg-teal-500/10 p-4 hover:shadow-card transition-shadow"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <QrCode className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-bold text-slate-900 dark:text-slate-100">
            {s.groupName}: davomat sessiyasi ochiq
          </span>
          <span className={buttonVariants({ variant: "primary", size: "sm" })}>Ekranni ochish</span>
        </Link>
      ))}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatLink
          href="/mentor/homework"
          label="Tekshirish kerak"
          icon={ClipboardCheck}
          value={data.ungradedHomework}
          hint="uyga vazifa javobi"
          tone={data.ungradedHomework > 0 ? "warn" : "default"}
        />
        <StatLink
          href="/mentor/orders"
          label="Do'kon so'rovlari"
          icon={PackageCheck}
          value={data.pendingOrders}
          hint="yangi buyurtma"
          tone={data.pendingOrders > 0 ? "warn" : "default"}
        />
        <StatLink href="/mentor/groups" label="O'quvchilar" icon={Users} value={data.totals.students} hint={`${data.totals.groups} ta guruhda`} />
        <StatLink href="/mentor/lessons" label="Darslar" icon={BookOpen} value={data.totals.lessons} hint="jami yaratilgan" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashCard title="Tekshirilishi kerak vazifalar" icon={ClipboardCheck} href="/mentor/homework">
          {data.homeworkToCheck.length === 0 ? (
            <DashEmpty>Tekshirilmagan javob yo&apos;q.</DashEmpty>
          ) : (
            <ul className="space-y-2">
              {data.homeworkToCheck.map((h) => (
                <li key={h.lessonId}>
                  <Link
                    href={`/mentor/homework/${h.lessonId}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 hover:border-teal-500/50 transition-colors min-h-[56px]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{h.title}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{h.groupName}</span>
                    </span>
                    <Badge variant="gold">{h.ungraded} ta javob</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <DashCard title="Do'kon so'rovlari" icon={PackageCheck} href="/mentor/orders">
          {data.ordersPreview.length === 0 ? (
            <DashEmpty>Yangi buyurtma yo&apos;q.</DashEmpty>
          ) : (
            <ul className="space-y-2">
              {data.ordersPreview.map((o) => (
                <li key={o._id}>
                  <Link
                    href="/mentor/orders"
                    className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 hover:border-teal-500/50 transition-colors min-h-[56px]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{o.productTitle}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{o.studentName}</span>
                    </span>
                    <CoinBadge amount={o.price} size="sm" animate={false} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </div>

      <DashCard title="Guruhlar" icon={Users} href="/mentor/groups">
        {data.groups.length === 0 ? (
          <DashEmpty>Hali guruh yaratilmagan.</DashEmpty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.groups.map((g) => (
              <li key={g._id}>
                <Link
                  href={`/mentor/groups/${g._id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 hover:border-teal-500/50 transition-colors min-h-[64px]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{g.name}</span>
                      {g.hasLessonToday && (
                        <Badge variant="teal" className="gap-1">
                          <CalendarClock className="w-3 h-3" />
                          Bugun {g.todayTime}
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {g.grade}-sinf · {g.schedule}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{g.students}</span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">o&apos;quvchi · {g.lessons} dars</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  );
}
