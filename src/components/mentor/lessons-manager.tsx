"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, Trash2, Edit3, Eye, EyeOff, Video, FileText, ChevronDown } from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { ILessonData } from "@/lib/db/models/lesson.model";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { togglePublishLessonAction, deleteLessonAction } from "@/actions/lesson.actions";
import { cn } from "@/lib/utils";

interface LessonsManagerProps {
  groups: IGroupData[];
  initialLessons: ILessonData[];
  selectedGroupId: string;
  selectedQuarter: number;
}

export function LessonsManager({
  groups,
  initialLessons,
  selectedGroupId,
  selectedQuarter,
}: LessonsManagerProps) {
  const [lessons, setLessons] = useState<ILessonData[]>(initialLessons);
  const [lessonToDelete, setLessonToDelete] = useState<ILessonData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  const currentGroupId = selectedGroupId;
  const currentQuarter = selectedQuarter;

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            Darslar boshqaruvi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Guruhlar va choraklar bo&apos;yicha dars materiallarini boshqarish
          </p>
        </div>

        <Link
          href={`/mentor/lessons/new?groupId=${currentGroupId}&quarter=${currentQuarter}`}
        >
          <Button variant="primary" className="gap-2 shrink-0 min-h-[44px]">
            <Plus className="w-4 h-4" />
            Yangi dars qo&apos;shish
          </Button>
        </Link>
      </div>

      {/* Selectors for Group and Quarter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Group selector with scroll-snap */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory flex-1 min-w-0">
          {groups.map((g) => {
            const isSelected = currentGroupId === g._id.toString();
            return (
              <Link
                key={g._id.toString()}
                href={`/mentor/lessons?groupId=${g._id.toString()}&quarter=${currentQuarter}`}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 min-h-[44px] flex items-center justify-center snap-start",
                  isSelected
                    ? "bg-teal-600 text-white shadow-md shadow-teal-600/20"
                    : "bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                {g.name} ({g.grade}-sinf)
              </Link>
            );
          })}
        </div>

        {/* Quarter selector as a Select */}
        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
          <label
            htmlFor="quarter-select"
            className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0"
          >
            Chorak:
          </label>
          <div className="relative">
            <select
              id="quarter-select"
              value={currentQuarter || 1}
              onChange={(e) => {
                const q = e.target.value;
                router.push(`/mentor/lessons?groupId=${currentGroupId}&quarter=${q}`);
              }}
              aria-label="Chorakni tanlang"
              className="appearance-none pl-3.5 pr-9 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 text-slate-800 dark:text-slate-200 shadow-xs hover:border-teal-500/50 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer min-h-[44px]"
            >
              <option value={1}>1-chorak</option>
              <option value={2}>2-chorak</option>
              <option value={3}>3-chorak</option>
              <option value={4}>4-chorak</option>
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>
      </div>

      {/* Lessons List */}
      {lessons.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Bu chorakda hali darslar yo'q"
          description="Ushbu guruh va chorak uchun birinchi darsni yarating."
          action={
            <Link
              href={`/mentor/lessons/new?groupId=${currentGroupId}&quarter=${currentQuarter}`}
            >
              <Button variant="primary" className="gap-2 min-h-[44px]">
                <Plus className="w-4 h-4" />
                Dars qo&apos;shish
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson) => {
            const videoCount = lesson.materials?.filter((m) => m.type === "youtube").length || 0;
            const fileCount = lesson.materials?.filter((m) => m.type !== "youtube").length || 0;

            return (
              <div
                key={lesson._id.toString()}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 rounded-2xl border transition-all gap-4",
                  "bg-white dark:bg-[#131E32]",
                  lesson.isPublished
                    ? "border-slate-200/80 dark:border-slate-800/80 shadow-xs"
                    : "border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50/15 dark:bg-amber-950/10"
                )}
              >
                <div className="space-y-1.5 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
                      {lesson.order}-dars
                    </span>
                    <Badge variant={lesson.isPublished ? "success" : "warning"}>
                      {lesson.isPublished ? "Nashr etilgan" : "Qoralama"}
                    </Badge>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                    {lesson.title}
                  </h3>

                  {lesson.topic && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {lesson.topic}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
                    {videoCount > 0 && (
                      <span className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                        <Video className="w-3.5 h-3.5" />
                        {videoCount} video
                      </span>
                    )}
                    {fileCount > 0 && (
                      <span className="flex items-center gap-1 font-medium text-teal-600 dark:text-teal-400">
                        <FileText className="w-3.5 h-3.5" />
                        {fileCount} fayl
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(lesson._id.toString())}
                    className={cn(
                      "p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]",
                      lesson.isPublished
                        ? "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:bg-amber-950/30"
                        : "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/30"
                    )}
                    title={lesson.isPublished ? "Qoralamaga olish" : "Nashr qilish"}
                  >
                    {lesson.isPublished ? (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>Qoralama</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        <span>Nashr qilish</span>
                      </>
                    )}
                  </button>

                  <Link href={`/mentor/lessons/${lesson._id.toString()}/edit`}>
                    <button
                      type="button"
                      className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[44px] flex items-center gap-1.5 text-xs font-semibold"
                      title="Tahrirlash"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Tahrirlash</span>
                    </button>
                  </Link>

                  <button
                    type="button"
                    onClick={() => setLessonToDelete(lesson)}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer min-h-[44px] flex items-center justify-center"
                    aria-label={`${lesson.title} darsini o'chirish`}
                    title="O'chirish"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
              Darsga biriktirilgan barcha materiallar va testlar o&apos;chiriladi.
            </p>
          </div>
        }
      />
    </div>
  );
}
