import Link from "next/link";
import { ClipboardCheck, ChevronRight, Clock } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { getHomeworkOverviewForMentor } from "@/actions/homework.actions";
import { getGroups } from "@/actions/group.actions";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateTimeUz } from "@/lib/utils";

export const metadata = {
  title: "Uyga vazifalar — ITXiva",
};

interface PageProps {
  searchParams: Promise<{ group?: string }>;
}

export default async function MentorHomeworkPage({ searchParams }: PageProps) {
  await requireMentorPage();
  const { group: groupId } = await searchParams;
  const [items, groups] = await Promise.all([getHomeworkOverviewForMentor(groupId), getGroups()]);
  const ungradedTotal = items.reduce((sum, i) => sum + i.ungraded, 0);

  const chip = (active: boolean) =>
    cn(
      "shrink-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold min-h-[44px] flex items-center transition-colors",
      active
        ? "bg-teal-600 text-white shadow-xs"
        : "bg-white dark:bg-[#131E32] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800"
    );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <PageHeader
        icon={ClipboardCheck}
        title="Uyga vazifalar"
        subtitle={
          ungradedTotal > 0
            ? `${ungradedTotal} ta javob tekshirishni kutmoqda`
            : "O'quvchilar yuborgan javoblarni tekshiring va baholang"
        }
        actions={
          <Link href="/mentor/lessons" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Darsga vazifa qo&apos;shish
          </Link>
        }
      />

      <nav aria-label="Guruh bo'yicha filtr" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Link href="/mentor/homework" className={chip(!groupId)}>
          Barcha guruhlar
        </Link>
        {groups.map((g) => (
          <Link key={g._id.toString()} href={`/mentor/homework?group=${g._id}`} className={chip(groupId === g._id.toString())}>
            {g.name}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Hali uyga vazifa berilmagan"
          description="Darsni tahrirlash sahifasida “Uyga vazifa” blokini yoqing — vazifa shu yerda paydo bo'ladi."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const percent = item.totalStudents > 0 ? Math.round((item.submitted / item.totalStudents) * 100) : 0;
            return (
              <li key={item.lessonId}>
                <Link
                  href={`/mentor/homework/${item.lessonId}`}
                  className="group flex h-full flex-col gap-3 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#131E32] hover:border-teal-500/40 hover:shadow-md transition-all"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="teal">{item.groupName}</Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {item.quarter}-chorak · {item.order}-dars
                    </span>
                    {!item.isPublished && <Badge variant="warning">Qoralama</Badge>}
                    {item.ungraded > 0 && (
                      <Badge variant="gold" className="ml-auto">
                        {item.ungraded} tekshirilmagan
                      </Badge>
                    )}
                  </div>

                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {item.lessonTitle}
                  </h2>

                  <div className="mt-auto space-y-2">
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, percent)}%` }} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {item.submitted}/{item.totalStudents} topshirdi
                      </span>
                      <span className="flex items-center gap-1 min-w-0">
                        {item.dueAt && (
                          <>
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{formatDateTimeUz(item.dueAt)}</span>
                          </>
                        )}
                        <ChevronRight className="w-4 h-4 shrink-0" />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
