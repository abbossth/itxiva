"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { replanLessonsAction } from "@/actions/lesson.actions";
import type { ILessonData } from "@/lib/db/models/lesson.model";
import {
  formatSchedule,
  isLessonDay,
  isValidSchedule,
  lessonDaysBefore,
  lessonDaysFrom,
  toDateKey,
  UZ_WEEKDAYS_SHORT,
  weekdayOfKey,
  type GroupSchedule,
} from "@/lib/schedule";

const MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const label = (key: string) => {
  const [, m, d] = key.split("-").map(Number);
  return `${d}-${MONTHS[m - 1]}, ${UZ_WEEKDAYS_SHORT[weekdayOfKey(key) - 1]}`;
};

interface ReplanLessonsDialogProps {
  lessons: ILessonData[];
  schedule?: GroupSchedule | null;
}

/** Dars sanalarini jadval bo'yicha qayta taqsimlash: "N-dars shu kuni o'tiladi" — qolganlari undan hisoblanadi */
export function ReplanLessonsDialog({ lessons, schedule }: ReplanLessonsDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = toDateKey();
  const defaultDate = isLessonDay(schedule, today) ? today : (lessonDaysFrom(schedule, today, 1)[0] ?? today);
  const defaultLesson =
    lessons.find((l) => l.date && toDateKey(l.date) >= defaultDate) ?? lessons[lessons.length - 1];
  const [lessonId, setLessonId] = useState(defaultLesson?._id.toString() ?? "");
  const [dateKey, setDateKey] = useState(defaultDate);

  const idx = lessons.findIndex((l) => l._id.toString() === lessonId);
  // Natija oldindan ko'rinsin: tanlangan darsdan bitta oldingi va uchta keyingi
  const preview = useMemo(() => {
    if (idx < 0 || !dateKey) return [];
    const forward = lessonDaysFrom(schedule, dateKey, Math.min(4, lessons.length - idx));
    const [prev] = idx > 0 ? lessonDaysBefore(schedule, dateKey, 1) : [];
    const rows = forward.map((key, i) => ({ lesson: lessons[idx + i], key }));
    return prev ? [{ lesson: lessons[idx - 1], key: prev }, ...rows] : rows;
  }, [idx, dateKey, lessons, schedule]);

  if (lessons.length === 0) return null;
  const hasSchedule = isValidSchedule(schedule);

  const submit = async () => {
    if (!lessonId || !dateKey) return;
    try {
      setSaving(true);
      const res = await replanLessonsAction({ lessonId, dateKey });
      if (res.success) {
        toast.success(res.message || "Sanalar to'g'irlandi");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.message || "Sanalarni to'g'irlab bo'lmadi");
      }
    } catch {
      toast.error("Sanalarni to'g'irlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="shrink-0 gap-1.5 min-h-[40px]"
        title="Dars sanalari va vazifa muddatlarini guruh jadvali bo'yicha to'g'irlash"
      >
        <CalendarClock className="w-4 h-4" />
        <span className="hidden sm:inline">Sanalar</span>
      </Button>

      <Modal isOpen={open} onClose={() => !saving && setOpen(false)} title="Dars sanalarini to'g'irlash" maxWidth="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Qaysi dars qaysi kuni o&apos;tilishini tanlang — chorakdagi qolgan darslar guruh jadvali bo&apos;yicha
            {hasSchedule ? ` (${formatSchedule(schedule)})` : ""} oldinga va orqaga taqsimlanadi, dam olish kunlari
            o&apos;tkazib yuboriladi. Vazifa muddati — kamida 1 hafta.
          </p>

          {!hasSchedule && (
            <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
              Bu guruhning dars jadvali kiritilmagan. Avval Guruhlar bo&apos;limida jadvalni belgilang.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field htmlFor="replan-lesson" label="Dars">
              <Select id="replan-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
                {lessons.map((l) => (
                  <option key={l._id.toString()} value={l._id.toString()}>
                    {l.order}-dars · {l.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="replan-date" label="O'tiladigan kun">
              <Input id="replan-date" type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
            </Field>
          </div>

          {hasSchedule && preview.length > 0 && (
            <ul className="rounded-xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
              {preview.map(({ lesson, key }) => (
                <li
                  key={lesson._id.toString()}
                  className={
                    lesson._id.toString() === lessonId
                      ? "flex justify-between gap-3 px-3 py-2 font-bold text-teal-700 dark:text-teal-300"
                      : "flex justify-between gap-3 px-3 py-2 text-slate-700 dark:text-slate-300"
                  }
                >
                  <span className="truncate">
                    {lesson.order}-dars · {lesson.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs">{label(key)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Bekor qilish
            </Button>
            <Button type="button" onClick={submit} disabled={saving || !hasSchedule || !lessonId || !dateKey}>
              {saving ? "Saqlanmoqda..." : "To'g'irlash"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
