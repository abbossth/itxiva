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
    <div className="space-y-5">
      <Link
        href="/mentor/groups"
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 min-h-[44px] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Guruhlar ro&apos;yxatiga qaytish
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="teal">{group.grade}-sinf</Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{group.academicYear}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{group.name} guruhi</h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            {group.studentCount || 0} nafar o&apos;quvchi
          </span>
          <span
            className={`inline-flex items-center gap-1.5 ${isValidSchedule(group.schedule) ? "" : "text-amber-700 dark:text-amber-400"}`}
          >
            <CalendarClock className="w-4 h-4" />
            {formatSchedule(group.schedule)}
          </span>
        </p>
      </div>

      <GroupTabs groupId={id} activeSessionId={activeSession?._id ?? null} />

      {children}
    </div>
  );
}
