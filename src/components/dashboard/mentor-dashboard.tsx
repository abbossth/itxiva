import Link from "@/components/ui/link";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Gamepad2,
  GraduationCap,
  Inbox,
  PackageCheck,
  Plus,
  QrCode,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import type { MentorDashboard, MentorDayLesson } from "@/actions/dashboard.actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DashCard, DashEmpty, Greeting } from "@/components/dashboard/dashboard-parts";
import { cn } from "@/lib/utils";

// Mentor bosh sahifasi: bugungi darslar (mavzu va davomat), tekshirish navbati, haftalik ko'rsatkichlar,
// e'tibor kerak bo'lgan o'quvchilar, ertangi darslar va guruhlar — eng kerakli narsalar bir qarashda.

const todayLabel = () =>
  new Date().toLocaleDateString("uz-UZ", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Tashkent" });

export function MentorDashboardView({ data, promos }: { data: MentorDashboard; promos?: React.ReactNode }) {
  const q = data.queue;
  const queueTotal = q.homework + q.exams + q.quests + q.orders;
  const subtitle =
    data.today.length > 0 ? `${todayLabel()} · bugun ${data.today.length} ta guruhda dars` : `${todayLabel()} · bugun dars yo'q`;

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 basis-52">
          <Greeting name={data.firstName} subtitle={subtitle} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/mentor/live" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Gamepad2 className="w-4 h-4" />
            Jonli o&apos;yin
          </Link>
          <Link href="/mentor/lessons/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
            <Plus className="w-4 h-4" />
            Yangi dars
          </Link>
        </div>
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
          <span className="min-w-0 flex-1 text-sm font-bold text-slate-900 dark:text-slate-100">{s.groupName}: davomat ochiq</span>
          <span className={buttonVariants({ variant: "primary", size: "sm" })}>Ekranni ochish</span>
        </Link>
      ))}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Bugun */}
        <DashCard title="Bugungi darslar" icon={CalendarClock} href="/mentor/lessons" hrefLabel="Darslar" className="lg:col-span-2">
          {data.today.length === 0 ? (
            <DashEmpty>Bugun jadval bo&apos;yicha dars yo&apos;q. Dam oling yoki keyingi darslarni tayyorlang 🙂</DashEmpty>
          ) : (
            <ol className="relative space-y-2">
              {data.today.map((d) => (
                <TodayRow key={d.groupId} d={d} />
              ))}
            </ol>
          )}
        </DashCard>

        {/* Navbat */}
        <DashCard title="Bajarish kerak" icon={Inbox}>
          {queueTotal === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Hammasi tekshirilgan</p>
            </div>
          ) : (
            <ul className="space-y-2">
              <QueueRow href="/mentor/homework" icon={ClipboardCheck} label="Uyga vazifa javoblari" count={q.homework} />
              <QueueRow href="/mentor/exams" icon={GraduationCap} label="Imtihon javoblari" count={q.exams} />
              <QueueRow href="/mentor/quests/review" icon={Target} label="Topshiriq dalillari" count={q.quests} />
              <QueueRow href="/mentor/orders" icon={PackageCheck} label="Do'kon buyurtmalari" count={q.orders} />
            </ul>
          )}
          {data.homeworkToCheck.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Eng eski javoblar</p>
              <ul className="space-y-1">
                {data.homeworkToCheck.slice(0, 3).map((h) => (
                  <li key={h.lessonId}>
                    <Link
                      href={`/mentor/homework/${h.lessonId}`}
                      className="flex min-h-[40px] items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-300">{h.groupName}</span> {h.title}
                      </span>
                      <Badge variant="gold">{h.ungraded}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DashCard>
      </div>

      {promos}

      {/* Haftalik ko'rsatkichlar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Davomat (7 kun)"
          value={data.week.attendancePct === null ? "—" : `${data.week.attendancePct}%`}
          trend={data.week.attendancePct !== null && data.week.prevAttendancePct !== null ? data.week.attendancePct - data.week.prevAttendancePct : null}
          href="/mentor/reports"
        />
        <Kpi label="O'tilgan darslar (7 kun)" value={data.week.lessonsHeld} href="/mentor/reports" />
        <Kpi label="Topshirilgan vazifalar (7 kun)" value={data.week.homeworkSubmitted} href="/mentor/homework" />
        <Kpi label="O'quvchilar" value={data.totals.students} hint={`${data.totals.groups} ta guruh`} href="/mentor/groups" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashCard title="E'tibor kerak" icon={AlertTriangle} href="/mentor/reports" hrefLabel="Hisobotlar">
          {data.attention.length === 0 ? (
            <DashEmpty>Ketma-ket darsni qoldirgan o&apos;quvchi yo&apos;q 👍</DashEmpty>
          ) : (
            <ul className="space-y-1.5">
              {data.attention.map((a) => (
                <li key={a.studentId}>
                  <Link
                    href={`/mentor/students/${a.studentId}`}
                    className="flex min-h-[44px] items-center gap-3 rounded-xl border border-rose-200/70 bg-rose-50/60 px-3 py-2 text-sm hover:border-rose-300 dark:border-rose-500/20 dark:bg-rose-500/5"
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-slate-100">{a.name}</span>
                    <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-300">{a.group}</span>
                    <Badge variant="rose">{a.missed} dars kelmadi</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashCard>

        <DashCard title="Ertaga" icon={CalendarDays} href="/mentor/lessons" hrefLabel="Darslar">
          {data.tomorrow.length === 0 ? (
            <DashEmpty>Ertaga dars yo&apos;q.</DashEmpty>
          ) : (
            <ul className="space-y-1.5">
              {data.tomorrow.map((d) => (
                <li key={d.groupId}>
                  <Link
                    href={d.lesson ? `/mentor/lessons/${d.lesson.id}` : "/mentor/lessons/new"}
                    className="flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200/80 px-3 py-2 hover:border-teal-500/50 dark:border-slate-800"
                  >
                    <span className="w-24 shrink-0 font-mono text-xs text-slate-500">{d.time ?? "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs font-bold text-teal-700 dark:text-teal-300">{d.shortName}</span>
                      <span className={cn("block truncate text-sm", d.lesson ? "font-semibold text-slate-900 dark:text-slate-100" : "text-amber-700 dark:text-amber-300")}>
                        {d.lesson ? d.lesson.title : "Dars hali yaratilmagan — yaratish"}
                      </span>
                    </span>
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
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {data.groups.map((g) => (
              <li key={g._id}>
                <Link
                  href={`/mentor/groups/${g._id}`}
                  className={cn(
                    "flex h-full flex-col gap-0.5 rounded-xl border p-3 transition-colors hover:border-teal-500/50",
                    g.hasLessonToday ? "border-teal-500/40 bg-teal-50/60 dark:bg-teal-500/5" : "border-slate-200/80 dark:border-slate-800"
                  )}
                >
                  <span className="font-mono text-base font-black text-teal-700 dark:text-teal-300">{g.shortName}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {g.students} o&apos;quvchi · {g.lessons} dars
                  </span>
                  <span className="truncate text-[11px] text-slate-500">{g.hasLessonToday ? `Bugun ${g.todayTime}` : g.schedule}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    </div>
  );
}

function TodayRow({ d }: { d: MentorDayLesson }) {
  const s = d.session;
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 p-3 dark:border-slate-800 sm:flex-nowrap">
      <span className="flex w-20 shrink-0 flex-col">
        <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{d.time?.split("–")[0] ?? "—"}</span>
        <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-300">{d.shortName}</span>
      </span>
      <span className="min-w-0 flex-1 basis-40">
        {d.lesson ? (
          <Link href={`/mentor/lessons/${d.lesson.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100">
            <BookOpen className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
            {d.lesson.title}
          </Link>
        ) : (
          <Link href="/mentor/lessons/new" className="block truncate text-sm font-semibold text-amber-700 hover:underline dark:text-amber-300">
            Bugungi dars yaratilmagan — yaratish
          </Link>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {d.lesson && !d.lesson.published && <Badge variant="gold">nashr qilinmagan</Badge>}
          {s ? (
            s.active ? (
              <Badge variant="teal">davomat ochiq</Badge>
            ) : (
              <span>
                ✅ {s.present}/{s.present + s.absent} keldi
              </span>
            )
          ) : (
            <span>{d.students} o&apos;quvchi · davomat hali olinmagan</span>
          )}
        </span>
      </span>
      <Link
        href={s?.active ? `/mentor/attendance/${s.id}` : `/mentor/groups/${d.groupId}/attendance`}
        className={buttonVariants({ variant: s ? "secondary" : "primary", size: "sm", className: "shrink-0" })}
      >
        <QrCode className="h-4 w-4" />
        {s?.active ? "Ekran" : s ? "Davomat" : "Davomat olish"}
      </Link>
    </li>
  );
}

function QueueRow({ href, icon: Icon, label, count }: { href: string; icon: typeof Inbox; label: string; count: number }) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex min-h-[48px] items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors",
          count > 0 ? "border-amber-400/50 bg-amber-50 hover:border-amber-400 dark:bg-amber-500/10" : "border-slate-200/80 text-slate-500 dark:border-slate-800"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", count > 0 ? "text-amber-600" : "text-slate-400")} />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className={cn("font-mono text-base font-black tabular-nums", count > 0 ? "text-amber-700 dark:text-amber-300" : "text-slate-400")}>{count}</span>
      </Link>
    </li>
  );
}

function Kpi({ label, value, hint, trend = null, href }: { label: string; value: React.ReactNode; hint?: string; trend?: number | null; href: string }) {
  return (
    <Link
      href={href}
      className="stagger-item flex flex-col gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-card dark:border-slate-800/80 dark:bg-surface"
    >
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      <span className="flex items-end gap-2">
        <span className="font-display text-2xl font-extrabold leading-none tabular-nums text-slate-900 dark:text-slate-100 sm:text-3xl">{value}</span>
        {trend !== null && trend !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", trend > 0 ? "text-emerald-600" : "text-rose-600")}>
            {trend > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </span>
      {hint && <span className="truncate text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </Link>
  );
}
