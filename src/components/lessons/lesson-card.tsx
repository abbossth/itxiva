import Link from "@/components/ui/link";
import { Sparkles, Video, FileText, ChevronRight, ClipboardCheck, CalendarDays, Clock, ArrowRight } from "lucide-react";
import { HOMEWORK_STATE_BADGE, HOMEWORK_STATE_LABELS, type HomeworkState } from "@/lib/homework-status";
import { ILessonData } from "@/lib/db/models/lesson.model";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateUz } from "@/lib/utils";

interface LessonItemProps {
  lesson: ILessonData;
  /** O'quvchi uchun: shu darsdagi uyga vazifasining holati */
  homeworkState?: HomeworkState;
}

function materialCounts(lesson: ILessonData) {
  const videos = lesson.materials?.filter((m) => m.type === "youtube").length || 0;
  return { videos, files: (lesson.materials?.length || 0) - videos };
}

function homeworkLabel(state: HomeworkState) {
  return state === "missing" ? "Vazifa bor" : HOMEWORK_STATE_LABELS[state];
}

/** Ro'yxatdagi bitta dars qatori — butun qator bosiladi */
export function LessonRow({ lesson, homeworkState, isToday = false }: LessonItemProps & { isToday?: boolean }) {
  const { videos, files } = materialCounts(lesson);
  const hasHomework = Boolean(lesson.homework?.isEnabled);

  return (
    <Link
      href={`/lessons/${lesson._id}`}
      className={cn(
        "stagger-item card-press group flex items-center gap-3 sm:gap-4 rounded-2xl border p-3 sm:p-4 min-h-[64px] transition-colors",
        "bg-white dark:bg-surface hover:border-teal-500/50 hover:shadow-sm",
        isToday
          ? "border-teal-500/60 ring-1 ring-teal-500/20"
          : "border-slate-200/80 dark:border-slate-800/80"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold",
          isToday ? "bg-teal-600 text-white" : "bg-teal-500/10 text-teal-700 dark:text-teal-300"
        )}
      >
        {lesson.order}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            {lesson.title}
          </span>
          {isToday ? (
            <Badge variant="teal" className="shrink-0 font-semibold">
              Bugun
            </Badge>
          ) : (
            lesson.isNew && (
              <Badge variant="gold" className="shrink-0 gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Yangi
              </Badge>
            )
          )}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {lesson.date && (
            <span className="flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              {formatDateUz(lesson.date)}
            </span>
          )}
          {lesson.topic && <span className="truncate max-w-[16rem]">{lesson.topic}</span>}
          {videos > 0 && (
            <span className="flex items-center gap-1">
              <Video className="w-3.5 h-3.5 text-red-500" />
              {videos}
            </span>
          )}
          {files > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-teal-500" />
              {files}
            </span>
          )}
          {hasHomework && homeworkState && (
            <Badge variant={HOMEWORK_STATE_BADGE[homeworkState]} className="gap-1 sm:hidden">
              <ClipboardCheck className="w-3 h-3" />
              {homeworkLabel(homeworkState)}
            </Badge>
          )}
        </span>
      </span>

      {hasHomework && homeworkState && (
        <Badge variant={HOMEWORK_STATE_BADGE[homeworkState]} className="hidden sm:inline-flex shrink-0 gap-1">
          <ClipboardCheck className="w-3 h-3" />
          {homeworkLabel(homeworkState)}
        </Badge>
      )}
      <ChevronRight className="w-5 h-5 shrink-0 text-slate-400 group-hover:text-teal-500 group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

/** Bugungi dars — ro'yxat ustida alohida, ko'zga tashlanadigan karta */
export function TodayLessonCard({
  lesson,
  homeworkState,
  timeLabel,
  isNow = false,
}: LessonItemProps & { timeLabel?: string; isNow?: boolean }) {
  const { videos, files } = materialCounts(lesson);
  const hasHomework = Boolean(lesson.homework?.isEnabled);

  return (
    <Link
      href={`/lessons/${lesson._id}`}
      className="card-press group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 to-teal-800 p-5 sm:p-6 text-white shadow-lg shadow-teal-600/20"
    >
      {/* Bezak doiralari. Faqat teal-* — u foydalanuvchi tanlagan aksent rangiga qayta xaritalanadi */}
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-white/5" />

      <div className="relative flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 uppercase tracking-wide">
          <span className="relative flex h-2 w-2">
            {isNow && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          {isNow ? "Hozir ketmoqda" : "Bugungi dars"}
        </span>
        <span className="rounded-full bg-white/15 px-2.5 py-1">{lesson.order}-dars</span>
        {timeLabel && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
            <Clock className="w-3.5 h-3.5" />
            {timeLabel}
          </span>
        )}
      </div>

      <h2 className="relative mt-3 text-xl sm:text-2xl font-black tracking-tight line-clamp-2">{lesson.title}</h2>
      {lesson.topic && <p className="relative mt-1 text-sm text-white/85 line-clamp-2">{lesson.topic}</p>}

      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
          {videos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1">
              <Video className="w-3.5 h-3.5" />
              {videos} video
            </span>
          )}
          {files > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1">
              <FileText className="w-3.5 h-3.5" />
              {files} fayl
            </span>
          )}
          {hasHomework && homeworkState && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1">
              <ClipboardCheck className="w-3.5 h-3.5" />
              {homeworkLabel(homeworkState)}
            </span>
          )}
        </div>
        <span className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-teal-700 shadow-sm transition-transform group-hover:translate-x-0.5">
          Darsga kirish
          <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  );
}
