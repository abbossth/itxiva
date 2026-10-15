import { BookOpen, Calendar } from "lucide-react";
import type { ILessonData } from "@/lib/db/models/lesson.model";
import { YouTubeFacade } from "@/components/lessons/youtube-facade";
import { FilePreview } from "@/components/lessons/file-preview";
import { formatDateUz } from "@/lib/utils";

/** Darsning asosiy mazmuni: sarlavha, video, konspekt va fayllar. O'quvchi ham, mentor ham aynan shuni ko'radi. */
export function LessonBody({ lesson, badges }: { lesson: ILessonData; badges?: React.ReactNode }) {
  const videos = lesson.materials?.filter((m) => m.type === "youtube") ?? [];

  return (
    <>
      <div className="space-y-2 border-b border-slate-100 dark:border-slate-800/80 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            {lesson.quarter}-chorak &bull; {lesson.order}-dars
          </span>
          {lesson.date && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateUz(lesson.date)}
            </span>
          )}
          {badges}
        </div>

        <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          {lesson.title}
        </h1>

        {lesson.topic && <p className="text-sm sm:text-base font-medium text-teal-600 dark:text-teal-400">{lesson.topic}</p>}
      </div>

      {videos.map((video, i) => (
        <div key={video._id?.toString() ?? i} className="space-y-2">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-red-500" />
            {videos.length > 1 ? video.title || `Dars videosi ${i + 1}` : "Dars videosi"}
          </h2>
          <YouTubeFacade url={video.urlOrKey} title={video.title || lesson.title} trackLessonId={String(lesson._id)} />
        </div>
      ))}

      {lesson.description && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Dars tavsifi</h2>
          <div className="text-sm sm:text-base text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-4 sm:p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
            {lesson.description}
          </div>
        </div>
      )}

      {lesson.materials && lesson.materials.length > 0 && (
        <div className="pt-2">
          <FilePreview lessonId={lesson._id.toString()} materials={lesson.materials} />
        </div>
      )}
    </>
  );
}
