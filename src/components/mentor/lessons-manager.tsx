"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, Trash2, Edit3, Eye, EyeOff, Video, FileText, ChevronDown, ClipboardCheck, ChevronRight } from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { ILessonData } from "@/lib/db/models/lesson.model";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { togglePublishLessonAction, deleteLessonAction } from "@/actions/lesson.actions";
import { HomeworkJournal } from "@/components/mentor/homework-journal";
import type { HomeworkJournal as JournalData, HomeworkOverviewItem, LessonHomeworkStats } from "@/actions/homework.actions";
import { describeDue } from "@/lib/homework-status";
import { groupShortName } from "@/lib/group-name";
import { cn, formatDateUz } from "@/lib/utils";

interface LessonsManagerProps {
  groups: IGroupData[];
  initialLessons: ILessonData[];
  selectedGroupId: string;
  selectedQuarter: number;
  view: "list" | "journal";
  /** dars ID -> vazifa topshirish holati (vazifasi yo'q darslar kirmaydi) */
  stats: Record<string, LessonHomeworkStats>;
  /** Barcha guruhlar bo'yicha tekshirilmagan javobi bor vazifalar */
  toCheck: HomeworkOverviewItem[];
  journal: JournalData | null;
}

export function LessonsManager({
  groups,
  initialLessons,
  selectedGroupId,
  selectedQuarter,
  view,
  stats,
  toCheck,
  journal,
}: LessonsManagerProps) {
  const [lessons, setLessons] = useState<ILessonData[]>(initialLessons);
  const [lessonToDelete, setLessonToDelete] = useState<ILessonData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  const currentGroupId = selectedGroupId;
  const currentQuarter = selectedQuarter;
  const hrefFor = (groupId: string, quarter: number, v: "list" | "journal" = view) =>
    `/mentor/lessons?groupId=${groupId}&quarter=${quarter}${v === "journal" ? "&view=journal" : ""}`;
  const ungradedByGroup = new Map<string, number>();
  for (const item of toCheck) ungradedByGroup.set(item.groupId, (ungradedByGroup.get(item.groupId) ?? 0) + item.ungraded);
  const ungradedTotal = toCheck.reduce((sum, i) => sum + i.ungraded, 0);

  const handleTogglePublish = async (lessonId: string) => {
    try {
      const res = await togglePublishLessonAction(lessonId);
      if (res.success) {
        setLessons(
          lessons.map((l) =>
            l._id.toString() === lessonId ? { ...l, isPublished: res.isPublished! } : l
          )
        );
        toast.success(
          res.isPublished ? "Dars nashr etildi va o'quvchilarga ko'rinadi" : "Dars qoralamaga olindi"
        );
      } else {
        toast.error("Holatni o'zgartirib bo'lmadi");
      }
    } catch {
      toast.error("Xatolik yuz berdi");
    }
  };

  const handleConfirmDelete = async () => {
    if (!lessonToDelete) return;
    try {
      setIsDeleting(true);
      const res = await deleteLessonAction(lessonToDelete._id.toString());
      if (res.success) {
        setLessons(lessons.filter((l) => l._id.toString() !== lessonToDelete._id.toString()));
        toast.success(`"${lessonToDelete.title}" darsi o'chirildi`);
        setLessonToDelete(null);
      } else {
        toast.error(res.message || "Darsni o'chirib bo'lmadi");
      }
    } catch {
      toast.error("Xatolik yuz berdi");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            Darslar
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            {ungradedTotal > 0
              ? `${ungradedTotal} ta uyga vazifa javobi tekshirishni kutmoqda`
              : "Dars materiallari va uyga vazifalar bir joyda"}
          </p>
        </div>

        <Link
          href={`/mentor/lessons/new?groupId=${currentGroupId}&quarter=${currentQuarter}`}
          className={buttonVariants({ variant: "primary", className: "shrink-0" })}
        >
          <Plus className="w-4 h-4" />
          Yangi dars
        </Link>
      </div>

      {/* Tekshirish kerak: barcha guruhlar bo'yicha */}
      {toCheck.length > 0 && (
        <section aria-labelledby="to-check-heading" className="rounded-2xl border border-amber-500/40 bg-amber-50/70 dark:bg-amber-500/10 p-3">
          <h2 id="to-check-heading" className="flex items-center gap-2 px-1 pb-2 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
            <ClipboardCheck className="w-4 h-4" />
            Tekshirish kerak
          </h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {toCheck.map((item) => (
              <li key={item.lessonId}>
                <Link
                  href={`/mentor/homework/${item.lessonId}`}
                  className="flex items-center gap-2 rounded-xl bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800 px-3 min-h-[44px] hover:border-teal-500/50 transition-colors"
                >
                  <Badge variant="teal" className="shrink-0" title={item.groupName}>{item.groupShortName}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span className="font-normal text-slate-600 dark:text-slate-400">{item.order}-dars · </span>
                    {item.lessonTitle}
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold font-mono text-slate-950">
                    {item.ungraded}
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filtrlar: guruh, chorak, ko'rinish */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-1 min-w-0 pb-1 lg:pb-0">
          {groups.map((g) => {
            const id = g._id.toString();
            const isSelected = currentGroupId === id;
            const pending = ungradedByGroup.get(id) ?? 0;
            return (
              <Link
                key={id}
                href={hrefFor(id, currentQuarter)}
                aria-current={isSelected ? "true" : undefined}
                title={`${g.name} (${g.grade}-sinf)`}
                className={cn(
                  "px-3.5 rounded-xl text-sm font-bold font-mono transition-colors shrink-0 min-h-[40px] flex items-center gap-1.5",
                  isSelected
                    ? "bg-teal-600 text-white"
                    : "bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                {groupShortName(g)}
                {pending > 0 && (
                  <span
                    title={`${pending} ta tekshirilmagan javob`}
                    className="rounded-full bg-amber-500 px-1.5 text-[10px] font-mono text-slate-950"
                  >
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <select
              id="quarter-select"
              value={currentQuarter || 1}
              onChange={(e) => router.push(hrefFor(currentGroupId, Number(e.target.value)))}
              aria-label="Chorakni tanlang"
              className="appearance-none pl-3 pr-8 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-surface border border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 hover:border-teal-500/50 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors cursor-pointer min-h-[40px]"
            >
              <option value={1}>1-chorak</option>
              <option value={2}>2-chorak</option>
              <option value={3}>3-chorak</option>
              <option value={4}>4-chorak</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>

          <div role="group" aria-label="Ko'rinish" className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60">
            {(
              [
                ["list", "Ro'yxat"],
                ["journal", "Vazifalar jurnali"],
              ] as const
            ).map(([id, label]) => (
              <Link
                key={id}
                href={hrefFor(currentGroupId, currentQuarter, id)}
                aria-current={view === id ? "true" : undefined}
                className={cn(
                  "px-3 min-h-[32px] flex items-center rounded-lg text-xs font-semibold transition-colors",
                  view === id
                    ? "bg-white dark:bg-surface text-teal-700 dark:text-teal-300 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === "journal" ? (
        <HomeworkJournal journal={journal} />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Bu chorakda hali darslar yo'q"
          description="Ushbu guruh va chorak uchun birinchi darsni yarating."
          action={
            <Link
              href={`/mentor/lessons/new?groupId=${currentGroupId}&quarter=${currentQuarter}`}
              className={buttonVariants({ variant: "primary" })}
            >
              <Plus className="w-4 h-4" />
              Dars qo&apos;shish
            </Link>
          }
        />
      ) : (
        <ul className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface divide-y divide-slate-100 dark:divide-slate-800/70 overflow-hidden page-enter">
          {lessons.map((lesson) => {
            const id = lesson._id.toString();
            const videoCount = lesson.materials?.filter((m) => m.type === "youtube").length || 0;
            const fileCount = lesson.materials?.filter((m) => m.type !== "youtube").length || 0;
            const hw = stats[id];
            const missing = hw ? Math.max(0, hw.totalStudents - hw.submitted) : 0;
            const due = hw ? describeDue(hw.dueAt) : null;
            const percent = hw && hw.totalStudents > 0 ? Math.round((hw.submitted / hw.totalStudents) * 100) : 0;

            return (
              <li
                key={id}
                className={cn(
                  "flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-3 sm:px-4 py-2.5",
                  !lesson.isPublished && "bg-amber-50/40 dark:bg-amber-950/10"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 font-mono text-sm font-bold text-teal-700 dark:text-teal-300">
                    {lesson.order}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/mentor/lessons/${id}/edit`}
                        className="truncate text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-300"
                      >
                        {lesson.title}
                      </Link>
                      {!lesson.isPublished && <Badge variant="warning" className="shrink-0">Qoralama</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-slate-600 dark:text-slate-400">
                      {lesson.date && <span>{formatDateUz(lesson.date)}</span>}
                      {videoCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Video className="w-3.5 h-3.5" />
                          {videoCount}
                        </span>
                      )}
                      {fileCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {fileCount}
                        </span>
                      )}
                      {lesson.topic && <span className="truncate max-w-[260px]">{lesson.topic}</span>}
                    </div>
                  </div>
                </div>

                {/* Uyga vazifa holati */}
                <div className="md:w-[300px] shrink-0 pl-12 md:pl-0">
                  {hw ? (
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-xs">
                          <span className="font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                            {hw.submitted}/{hw.totalStudents}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">topshirdi</span>
                          {missing > 0 && due?.overdue && (
                            <span className="font-semibold text-rose-700 dark:text-rose-400">{missing} topshirmagan</span>
                          )}
                          {due && !due.overdue && <span className="text-slate-600 dark:text-slate-400">· {due.remaining}</span>}
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, percent)}%` }} />
                        </div>
                      </div>
                      <Link
                        href={`/mentor/homework/${id}`}
                        className={buttonVariants({
                          variant: hw.ungraded > 0 ? "primary" : "outline",
                          size: "sm",
                          className: "shrink-0",
                        })}
                      >
                        {hw.ungraded > 0 ? `Tekshirish (${hw.ungraded})` : "Javoblar"}
                      </Link>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Vazifa yo&apos;q ·{" "}
                      <Link href={`/mentor/lessons/${id}/edit#homework`} className="font-semibold text-teal-700 dark:text-teal-300 hover:underline">
                        qo&apos;shish
                      </Link>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5 shrink-0 pl-12 md:pl-0">
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(id)}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors cursor-pointer",
                      lesson.isPublished
                        ? "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        : "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
                    )}
                    title={lesson.isPublished ? "Qoralamaga olish (o'quvchilardan yashirish)" : "Nashr qilish"}
                    aria-label={lesson.isPublished ? `${lesson.title}: qoralamaga olish` : `${lesson.title}: nashr qilish`}
                  >
                    {lesson.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {!lesson.isPublished && <span>Nashr qilish</span>}
                  </button>
                  <Link
                    href={`/mentor/lessons/${id}/edit`}
                    title="Tahrirlash"
                    aria-label={`${lesson.title}: tahrirlash`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setLessonToDelete(lesson)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    aria-label={`${lesson.title} darsini o'chirish`}
                    title="O'chirish"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Safety confirm dialog for deleting lesson */}
      <ConfirmDialog
        isOpen={Boolean(lessonToDelete)}
        onClose={() => setLessonToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Darsni o'chirish"
        danger
        confirmText="Ha, o'chirish"
        isLoading={isDeleting}
        description={
          <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p>
              Haqiqatan ham <strong>&quot;{lessonToDelete?.title}&quot;</strong> darsini o&apos;chirmoqchimisiz?
            </p>
            <p className="text-rose-600 dark:text-rose-400 font-semibold">
              Darsga biriktirilgan barcha materiallar, testlar va uyga vazifa javoblari o&apos;chiriladi.
            </p>
          </div>
        }
      />
    </div>
  );
}
