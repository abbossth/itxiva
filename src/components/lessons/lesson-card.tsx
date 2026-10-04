"use client";

import Link from "next/link";
import { Sparkles, Video, FileText, ChevronRight, Eye, EyeOff } from "lucide-react";
import { ILessonData } from "@/lib/db/models/lesson.model";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LessonCardProps {
  lesson: ILessonData;
  isMentor?: boolean;
  onTogglePublish?: (id: string) => void;
}

export function LessonCard({ lesson, isMentor = false, onTogglePublish }: LessonCardProps) {
  const isNew = Boolean(lesson.isNew);

  const videoCount = lesson.materials?.filter((m) => m.type === "youtube").length || 0;
  const fileCount = lesson.materials?.filter((m) => m.type !== "youtube").length || 0;

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between p-5 rounded-2xl border transition-all duration-200",
        "bg-white dark:bg-[#131E32] hover:shadow-md",
        lesson.isPublished
          ? "border-slate-200/80 dark:border-slate-800/80 hover:border-teal-500/40"
          : "border-dashed border-amber-300 dark:border-amber-800/60 bg-amber-50/20 dark:bg-amber-950/10"
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              {lesson.order}-dars
            </span>
            {isNew && (
              <Badge variant="gold" className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Yangi
              </Badge>
            )}
          </div>

          {isMentor && (
            <div className="flex items-center gap-1.5">
              <Badge variant={lesson.isPublished ? "success" : "warning"}>
                {lesson.isPublished ? "Nashr etilgan" : "Qoralama"}
              </Badge>
              {onTogglePublish && (
                <button
                  type="button"
                  onClick={() => onTogglePublish(lesson._id.toString())}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={lesson.isPublished ? "Qoralamaga olish" : "Nashr qilish"}
                >
                  {lesson.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
          )}
        </div>

        <Link
          href={isMentor ? `/mentor/lessons/${lesson._id}/edit` : `/lessons/${lesson._id}`}
          className="block group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors"
        >
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
            {lesson.title}
          </h3>
          {lesson.topic && (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
              {lesson.topic}
            </p>
          )}
        </Link>
      </div>

      <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
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
          {videoCount === 0 && fileCount === 0 && (
            <span className="text-[11px] text-slate-400">Materiallar yo&apos;q</span>
          )}
        </div>

        <Link
          href={isMentor ? `/mentor/lessons/${lesson._id}/edit` : `/lessons/${lesson._id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline min-h-[36px] items-center"
        >
          {isMentor ? "Tahrirlash" : "Darsga o'tish"}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
