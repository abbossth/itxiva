"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, BookOpen, Trash2, Edit3, Eye, EyeOff, Video, FileText } from "lucide-react";
import { IGroupData } from "@/lib/db/models/group.model";
import { ILessonData } from "@/lib/db/models/lesson.model";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
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
  const currentGroupId = selectedGroupId;
  const currentQuarter = selectedQuarter;

  const handleTogglePublish = async (lessonId: string) => {
    const res = await togglePublishLessonAction(lessonId);
    if (res.success) {
      setLessons(
        lessons.map((l) =>
          l._id.toString() === lessonId ? { ...l, isPublished: res.isPublished! } : l
        )
      );
    }
  };

  const handleDelete = async (lessonId: string, title: string) => {
    if (!confirm(`Haqiqatan ham "${title}" darsini o'chirmoqchimisiz?`)) return;
    const res = await deleteLessonAction(lessonId);
    if (res.success) {
      setLessons(lessons.filter((l) => l._id.toString() !== lessonId));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Darslar boshqaruvi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Guruhlar va choraklar bo&apos;yicha darslarni tahrirlash hamda nashr etish
          </p>
        </div>

        <Link
          href={`/mentor/lessons/new?groupId=${currentGroupId}&quarter=${currentQuarter}`}
        >
          <Button variant="primary" className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Yangi dars qo&apos;shish
          </Button>
        </Link>
      </div>

      {/* Selectors for Group and Quarter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Group selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {groups.map((g) => {
            const isSelected = currentGroupId === g._id.toString();
            return (
              <Link
                key={g._id.toString()}
                href={`/mentor/lessons?groupId=${g._id.toString()}&quarter=${currentQuarter}`}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 min-h-[38px] flex items-center justify-center",
                  isSelected
                    ? "bg-teal-600 text-white shadow-xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {g.name} ({g.grade}-sinf)
              </Link>
            );
          })}
        </div>

        {/* Quarter tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit shrink-0">
          {[1, 2, 3, 4].map((q) => {
            const isSelected = currentQuarter === q;
            return (
              <Link
                key={q}
                href={`/mentor/lessons?groupId=${currentGroupId}&quarter=${q}`}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all min-h-[36px] flex items-center justify-center",
                  isSelected
                    ? "bg-white dark:bg-[#131E32] text-teal-600 dark:text-teal-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                )}
              >
                {q}-chorak
              </Link>
            );
          })}
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
              <Button variant="primary" className="gap-2">
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
                    ? "border-slate-200/80 dark:border-slate-800/80"
                    : "border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50/15 dark:bg-amber-950/10"
                )}
              >
                <div className="space-y-1.5 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
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
                      <span className="flex items-center gap-1">
                        <Video className="w-3.5 h-3.5 text-red-500" />
                        {videoCount} video
                      </span>
                    )}
                    {fileCount > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-teal-500" />
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
                      "p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer min-h-[38px]",
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
                      className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer min-h-[38px] flex items-center gap-1 text-xs"
                      title="Tahrirlash"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span className="hidden sm:inline">Tahrirlash</span>
                    </button>
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleDelete(lesson._id.toString(), lesson.title)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer min-h-[38px]"
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
    </div>
  );
}
