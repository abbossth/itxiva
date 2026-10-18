import { BookOpen, Calendar } from "lucide-react";
import type { ILessonData } from "@/lib/db/models/lesson.model";
import { YouTubeFacade } from "@/components/lessons/youtube-facade";
import { formatDateUz } from "@/lib/utils";

// Dars mazmuni bo'laklarga ajratilgan: sahifa ularni tablarga joylaydi. O'quvchi ham, mentor ham aynan shuni ko'radi.

export const lessonVideos = (lesson: ILessonData) => lesson.materials?.filter((m) => m.type === "youtube") ?? [];
export const lessonFiles = (lesson: ILessonData) => lesson.materials?.filter((m) => m.type !== "youtube") ?? [];
/** "Dars" tabida ko'rsatiladigan narsa bormi (video yoki konspekt) */
export const hasLessonMain = (lesson: ILessonData) => lessonVideos(lesson).length > 0 || Boolean(lesson.description?.trim());

/** Sarlavha: chorak/tartib, sana, nom va mavzu */
export function LessonHeader({ lesson, badges }: { lesson: ILessonData; badges?: React.ReactNode }) {
  return (
    <div className="space-y-2">
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

      <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{lesson.title}</h1>

      {lesson.topic && <p className="text-sm sm:text-base font-medium text-teal-600 dark:text-teal-400">{lesson.topic}</p>}
    </div>
  );
}

/** Dars videosi va konspekti */
export function LessonMain({ lesson }: { lesson: ILessonData }) {
  const videos = lessonVideos(lesson);

  return (
    <div className="space-y-6">
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
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Dars konspekti</h2>
          <div className="text-sm sm:text-base text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
            {lesson.description}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tab ichidagi oq karta */
export function LessonPanelCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-surface p-5 sm:p-7 shadow-xs ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
