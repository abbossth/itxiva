import Link from "next/link";
import { BookOpen, CalendarClock, ClipboardCheck, Clock, Coins, PackageCheck, QrCode, Trophy } from "lucide-react";
import type { StudentDashboard } from "@/actions/dashboard.actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DashCard, DashEmpty, Greeting, StatLink } from "@/components/dashboard/dashboard-parts";
import { describeDue, HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS } from "@/lib/homework-status";
import { formatDateTimeUz, formatDateUz } from "@/lib/utils";

export function StudentDashboardView({ data }: { data: StudentDashboard }) {
  const { homework } = data;
  const subtitle =
    homework.todoCount > 0
      ? `${homework.todoCount} ta vazifa sizni kutyapti`
      : data.groupName
        ? `${data.groupName} guruhi — hamma vazifalar topshirilgan`
        : "Siz hali guruhga biriktirilmagansiz";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <Greeting name={data.firstName} subtitle={subtitle} />

      {data.attendanceOpen && (
        <Link
          href="/attendance"
          className="stagger-item flex items-center gap-3 rounded-2xl border border-teal-500/50 bg-teal-50 dark:bg-teal-500/10 p-4 hover:shadow-card transition-shadow"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <QrCode className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">Davomat ochiq</span>
            <span className="block text-xs text-slate-600 dark:text-slate-400">Proyektordagi kodni kiriting yoki QR kodni skanerlang</span>
          </span>
          <span className={buttonVariants({ variant: "primary", size: "sm" })}>O&apos;tish</span>
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatLink
          href="/attendance"
          label="Keyingi dars"
          icon={CalendarClock}
          value={<span className="text-lg sm:text-xl">{data.nextLesson ? data.nextLesson.label.split(" ")[0] : "—"}</span>}
          hint={data.nextLesson ? data.nextLesson.label.split(" ").slice(1).join(" ") : "Jadval belgilanmagan"}
          tone={data.nextLesson?.isNow ? "accent" : "default"}
        />
        <StatLink
          href="/homework"
          label="Topshirish kerak"
          icon={ClipboardCheck}
          value={homework.todoCount}
          hint={homework.waitingCount > 0 ? `${homework.waitingCount} ta tekshirilmoqda` : "vazifa"}
          tone={homework.todoCount > 0 ? "warn" : "default"}
        />
        <StatLink href="/shop" label="Coin balansi" icon={Coins} value={data.balance} hint={`Jami yig'ilgan: ${data.totalCoins}`} />
        <StatLink
          href="/leaderboard"
          label="Reytingdagi o'rin"
          icon={Trophy}
          value={data.rank ? `${data.rank.position}` : "—"}
          hint={data.rank ? `guruhda ${data.rank.total} o'quvchidan` : "Reyting mavjud emas"}
        />
      </div>

      {data.ordersToConfirm > 0 && (
        <Link
          href="/shop/orders"
          className="stagger-item flex items-center gap-3 rounded-2xl border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          <PackageCheck className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="flex-1">{data.ordersToConfirm} ta buyurtma topshirildi — olganingizni tasdiqlang</span>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <DashCard title="Vazifalar" icon={ClipboardCheck} href="/homework">
          {homework.todo.length === 0 ? (
            <DashEmpty>Topshirilmagan vazifa yo&apos;q. Barakalla!</DashEmpty>
          ) : (
            <ul className="space-y-2">
              {homework.todo.map((h) => {
                const due = describeDue(h.dueAt);
                return (
                  <li key={h.lessonId}>
                    <Link
                      href={`/lessons/${h.lessonId}#homework`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 hover:border-teal-500/50 transition-colors min-h-[56px]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{h.title}</span>
                        {h.dueAt && (
                          <span
                            className={`mt-0.5 flex items-center gap-1 text-[11px] ${due?.overdue ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}
                          >
                            <Clock className="w-3 h-3 shrink-0" />
                            {formatDateTimeUz(h.dueAt)}
                            {due ? ` · ${due.remaining}` : ""}
                          </span>
                        )}
                      </span>
                      <Badge variant={HOMEWORK_STATE_BADGE[h.state]}>{HOMEWORK_STATE_LABELS[h.state]}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </DashCard>

        <DashCard title="So'nggi darslar" icon={BookOpen} href="/lessons">
          {data.recentLessons.length === 0 ? (
            <DashEmpty>Hali dars nashr etilmagan.</DashEmpty>
          ) : (
            <ul className="space-y-2">
              {data.recentLessons.map((l) => (
                <li key={l._id}>
                  <Link
                    href={`/lessons/${l._id}`}
                    className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 hover:border-teal-500/50 transition-colors min-h-[56px]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 font-mono text-xs font-bold text-teal-700 dark:text-teal-300">
                      {l.order}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{l.title}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        {l.quarter}-chorak{l.date ? ` · ${formatDateUz(l.date)}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashCard>
      </div>
    </div>
  );
}
