import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Group } from "@/lib/db/models/group.model";
import { Quiz } from "@/lib/db/models/quiz.model";
import { AttendanceSession } from "@/lib/db/models/attendance-session.model";
import {
  addDaysToKey,
  dateFromKey,
  homeworkDueAfter,
  isValidSchedule,
  lastLessonDayOnOrBefore,
  lessonDaysBefore,
  lessonDaysFrom,
  toDateKey,
  type GroupSchedule,
} from "@/lib/schedule";

// Dars sanalari rejasi: har bir dars kunida bitta dars o'tiladi (dam olish kunlari o'tkazib yuboriladi).
// Bir dars belgilangan kunga "langar" qilinadi, qolganlari guruh jadvali bo'yicha undan oldinga/orqaga taqsimlanadi.
// Uyga vazifa muddati — dars kunidan kamida bir hafta keyingi dars boshlanishi (`homeworkDueAfter`).
// Bu fayl "use server" emas: server action'lar, cron va testlar chaqiradi.

type Id = string | mongoose.Types.ObjectId;

interface PlanLesson {
  _id: mongoose.Types.ObjectId;
  order: number;
  date?: Date | null;
  homework?: { isEnabled?: boolean; instructions?: string; attachments?: unknown[]; dueAt?: Date | null } | null;
}

export interface ReplanResult {
  lessons: number;
  datesChanged: number;
  duesChanged: number;
}

/** Bazadagi dars sanasi: sana kalitidan (Toshkent kuni) — boshqa joylardagi kabi UTC yarim tun */
const storedDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

const hasHomework = (l: PlanLesson) =>
  Boolean(l.homework && (l.homework.instructions?.trim() || (l.homework.attachments?.length ?? 0) > 0));

/**
 * Vazifaning yangi muddati yoki null (o'zgarmaydi).
 * Yopiq vazifa — rejadagi muddat. Ochiq vazifa muddati faqat uzaytiriladi va faqat hali o'tmagan bo'lsa:
 * o'tib ketgan muddatga tegilmaydi (jarimalar tarixi buzilmasin), muddatsiz vazifa muddatsiz qoladi.
 */
function nextDue(lesson: PlanLesson, planned: Date, now: Date): Date | null {
  if (!hasHomework(lesson)) return null;
  const current = lesson.homework?.dueAt ? new Date(lesson.homework.dueAt) : null;
  if (lesson.homework?.isEnabled) {
    if (!current || current.getTime() <= now.getTime()) return null;
    return planned.getTime() > current.getTime() ? planned : null;
  }
  return current?.getTime() === planned.getTime() ? null : planned;
}

/**
 * Guruhning bir chorakdagi darslari sanasini qayta taqsimlaydi: langar dars `anchorKey` kuni, undan keyingilari
 * keyingi dars kunlariga. `includePast` bo'lsa undan oldingi darslar ham orqaga qarab ketma-ket dars kunlariga
 * qo'yiladi; aks holda faqat tartibni buzadiganlari (sanasi langardan keyin yoki teng) tuzatiladi.
 */
export async function replanLessonsFromAnchor(params: {
  groupId: Id;
  quarter: number;
  anchor: { lessonId: Id } | { order: number };
  anchorKey: string;
  includePast?: boolean;
  schedule?: GroupSchedule | null;
  now?: Date;
}): Promise<ReplanResult | null> {
  await connectToDatabase();
  const now = params.now ?? new Date();
  const schedule =
    params.schedule ?? (await Group.findById(params.groupId).select("schedule").lean())?.schedule ?? null;
  if (!isValidSchedule(schedule)) return null;

  const lessons = (await Lesson.find({ groupId: params.groupId, quarter: params.quarter })
    .select("order date homework")
    .sort({ order: 1, date: 1, _id: 1 })
    .lean()) as unknown as PlanLesson[];
  if (lessons.length === 0) return null;
  const anchor = params.anchor;
  let idx: number;
  let anchorKey: string | undefined = params.anchorKey;
  if ("lessonId" in anchor) {
    idx = lessons.findIndex((l) => l._id.toString() === anchor.lessonId.toString());
  } else {
    // Shu raqamli dars bo'lmasa — eng yaqin keyingi (yoki oxirgi) dars, sanasi raqamlar farqicha suriladi
    idx = lessons.findIndex((l) => l.order >= anchor.order);
    if (idx < 0) idx = lessons.length - 1;
    const shift = lessons[idx].order - anchor.order;
    if (shift > 0) anchorKey = lessonDaysFrom(schedule, params.anchorKey, shift + 1)[shift];
    else if (shift < 0) anchorKey = lessonDaysBefore(schedule, params.anchorKey, -shift)[-shift - 1];
  }
  if (idx < 0 || !anchorKey) return null;

  // Har bir darsning yangi sana kaliti (darslar ro'yxatidagi o'rni bo'yicha)
  const plan = new Map<number, string>();
  const forward = lessonDaysFrom(schedule, anchorKey, lessons.length - idx);
  forward.forEach((key, i) => plan.set(idx + i, key));

  const before = lessonDaysBefore(schedule, anchorKey, idx);
  if (params.includePast) {
    before.forEach((key, i) => plan.set(idx - 1 - i, key));
  } else {
    // Oldingi darslardan faqat langardan keyin turib qolganlari orqaga olinadi
    let limit = anchorKey;
    for (let j = idx - 1, i = 0; j >= 0; j--, i++) {
      const current = lessons[j].date ? toDateKey(lessons[j].date!) : null;
      if (current && current < limit) break;
      const key = before[i];
      if (!key) break;
      plan.set(j, key);
      limit = key;
    }
  }

  const ops: Parameters<typeof Lesson.bulkWrite>[0] = [];
  let datesChanged = 0;
  let duesChanged = 0;
  for (const [i, key] of plan) {
    const lesson = lessons[i];
    const $set: Record<string, unknown> = {};
    if (!lesson.date || toDateKey(lesson.date) !== key || new Date(lesson.date).getTime() !== storedDate(key).getTime()) {
      $set.date = storedDate(key);
      if (!lesson.date || toDateKey(lesson.date) !== key) datesChanged++;
    }
    const due = nextDue(lesson, homeworkDueAfter(schedule, key), now);
    if (due) {
      $set["homework.dueAt"] = due;
      duesChanged++;
    }
    if (Object.keys($set).length > 0) ops.push({ updateOne: { filter: { _id: lesson._id }, update: { $set } } });
  }
  if (ops.length > 0) await Lesson.bulkWrite(ops);
  return { lessons: plan.size, datesChanged, duesChanged };
}

/** Darsning vazifasi ochiq yoki testi nashr etilgan — demak dars o'tilgan */
async function openedLessonIds(lessonIds: mongoose.Types.ObjectId[]): Promise<Set<string>> {
  const quizzes = await Quiz.find({ lessonId: { $in: lessonIds }, isPublished: true }).select("lessonId").lean();
  return new Set(quizzes.map((q) => q.lessonId.toString()));
}

/**
 * Mentor darsning vazifasi yoki testini ochdi — dars hozir (yoki oxirgi dars kunida) o'tilgan.
 * Shu dars oxirgi dars kuniga qo'yiladi va keyingi darslar jadval bo'yicha undan keyinga suriladi.
 * Eski darsni ochish rejani o'zgartirmaydi (undan keyingi dars allaqachon ochilgan bo'lsa).
 */
export async function anchorOpenedLesson(lessonId: Id, now: Date = new Date()): Promise<ReplanResult | null> {
  await connectToDatabase();
  const lesson = await Lesson.findById(lessonId).select("groupId quarter order").lean();
  if (!lesson) return null;
  const group = await Group.findById(lesson.groupId).select("schedule").lean();
  if (!isValidSchedule(group?.schedule)) return null;

  let anchorKey = lastLessonDayOnOrBefore(group.schedule, toDateKey(now));
  if (!anchorKey) return null;

  const siblings = (await Lesson.find({ groupId: lesson.groupId, quarter: lesson.quarter })
    .select("order date homework.isEnabled")
    .sort({ order: 1, date: 1, _id: 1 })
    .lean()) as unknown as PlanLesson[];
  const idx = siblings.findIndex((l) => l._id.toString() === lesson._id.toString());
  if (idx < 0) return null;

  const quizOpen = await openedLessonIds(siblings.map((l) => l._id));
  const isOpened = (l: PlanLesson) => Boolean(l.homework?.isEnabled) || quizOpen.has(l._id.toString());
  if (siblings.slice(idx + 1).some(isOpened)) return null;

  // Oldingi dars ham shu kuni ochilgan bo'lsa (mentor keyingi darsni oldindan ochyapti) — keyingi dars kuni
  const prev = siblings[idx - 1];
  if (prev && isOpened(prev) && prev.date && toDateKey(prev.date) >= anchorKey) {
    [anchorKey] = lessonDaysFrom(group.schedule, addDaysToKey(toDateKey(prev.date), 1), 1);
    if (!anchorKey) return null;
  }

  return replanLessonsFromAnchor({
    groupId: lesson.groupId,
    quarter: lesson.quarter,
    anchor: { lessonId: lesson._id },
    anchorKey,
    schedule: group.schedule,
    now,
  });
}

/** Oxirgi o'tilgan dars shundan uzoq bo'lsa chorak tugagan deb hisoblanadi va darslar surilmaydi */
const ACTIVE_WINDOW_DAYS = 21;

/**
 * Bo'lmay qolgan darslar: oxirgi o'tilgan (vazifasi/testi ochilgan) darsdan keyingi darsning kuni o'tib ketgan,
 * u hali ochilmagan va o'sha kuni guruhda davomat ham olinmagan (dars bo'lmagan) bo'lsa — u va keyingilari
 * bugundan boshlab dars kunlariga suriladi. Kunlik cron chaqiradi.
 * Davomat olingan kunda dars bo'lgan: qaysi dars o'tilgani noma'lum, shuning uchun surilmaydi — mentor
 * keyingi vazifani ochganda reja o'zi to'g'rilanadi (`anchorOpenedLesson`).
 */
export async function rollForwardLessons(now: Date = new Date()): Promise<{ groups: number; moved: number }> {
  await connectToDatabase();
  const todayKey = toDateKey(now);
  const groups = await Group.find({ isActive: true }).select("schedule").lean();

  let touched = 0;
  let moved = 0;
  for (const group of groups) {
    if (!isValidSchedule(group.schedule)) continue;
    const lessons = (await Lesson.find({ groupId: group._id })
      .select("quarter order date homework.isEnabled")
      .sort({ quarter: 1, order: 1, date: 1, _id: 1 })
      .lean()) as unknown as (PlanLesson & { quarter: number })[];
    if (lessons.length === 0) continue;

    const quizOpen = await openedLessonIds(lessons.map((l) => l._id));
    const isOpened = (l: PlanLesson) => Boolean(l.homework?.isEnabled) || quizOpen.has(l._id.toString());

    for (const quarter of new Set(lessons.map((l) => l.quarter))) {
      const list = lessons.filter((l) => l.quarter === quarter);
      let last = -1;
      list.forEach((l, i) => {
        if (isOpened(l)) last = i;
      });
      if (last < 0) continue;
      const anchorKey = list[last].date ? toDateKey(list[last].date!) : null;
      if (!anchorKey || anchorKey < addDaysToKey(todayKey, -ACTIVE_WINDOW_DAYS)) continue;

      const next = list[last + 1];
      const nextKey = next?.date ? toDateKey(next.date) : null;
      if (!next || !nextKey || nextKey >= todayKey) continue;
      const held = await AttendanceSession.exists({
        groupId: group._id,
        date: { $gte: dateFromKey(nextKey), $lt: dateFromKey(addDaysToKey(nextKey, 1)) },
      });
      if (held) continue;

      const from = addDaysToKey(anchorKey, 1) > todayKey ? addDaysToKey(anchorKey, 1) : todayKey;
      const [day] = lessonDaysFrom(group.schedule, from, 1);
      if (!day) continue;
      const result = await replanLessonsFromAnchor({
        groupId: group._id,
        quarter,
        anchor: { lessonId: next._id },
        anchorKey: day,
        schedule: group.schedule,
        now,
      });
      if (result) {
        touched++;
        moved += result.datesChanged;
      }
    }
  }
  return { groups: touched, moved };
}
