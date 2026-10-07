import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Users } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getGroupById } from "@/actions/group.actions";
import { getGroupsAttendanceOverview } from "@/actions/attendance.actions";
import { Badge } from "@/components/ui/badge";
import { GroupTabs } from "@/components/mentor/group-tabs";
import { formatSchedule, isValidSchedule } from "@/lib/schedule";

interface GroupLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

// Guruhning umumiy sarlavhasi va tablari: O'quvchilar va Davomat sahifalari shu qobiq ichida ochiladi
export default async function GroupLayout({ children, params }: GroupLayoutProps) {
  await requireMentorPage();
  const { id } = await params;
  const [group, overview] = await Promise.all([getGroupById(id), getGroupsAttendanceOverview()]);
  if (!group) notFound();

  const activeSession = overview.active.find((s) => s.groupId === id);

  return (
    <div className="space-y-4">
      {/* Ixcham sarlavha: asosiy mazmun (ro'yxat, jurnal) ekranning yuqorisida qolishi uchun */}
      <div className="flex items-center gap-2">
        <Link
          href="/mentor/groups"
          aria-label="Guruhlar ro'yxatiga qaytish"
          title="Guruhlar ro'yxatiga qaytish"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{group.name}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
            <Badge variant="teal">{group.grade}-sinf</Badge>
            <span className="inline-flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {group.studentCount || 0} o&apos;quvchi
            </span>
            <span className={`inline-flex items-center gap-1 ${isValidSchedule(group.schedule) ? "" : "text-amber-700 dark:text-amber-400"}`}>
              <CalendarClock className="w-3.5 h-3.5" />
              {formatSchedule(group.schedule)}
            </span>
          </div>
        </div>
      </div>

      <GroupTabs groupId={id} activeSessionId={activeSession?._id ?? null} />

      {children}
    </div>
  );
}
