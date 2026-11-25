import { connectToDatabase } from "@/lib/db/connect";
import { Group } from "@/lib/db/models/group.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Quiz } from "@/lib/db/models/quiz.model";
import { notifyGroup } from "@/lib/notifications/notify";
import { addDaysToKey, dateFromKey, homeworkDueAfter, isValidSchedule, toDateKey } from "@/lib/schedule";
import { formatDateTimeUz } from "@/lib/utils";

// Kun darsini avtomatik nashr qilish: dars kuni, guruh jadvalidagi dars boshlanishida dars o'quvchilarga ochiladi —
// uyga vazifasi (yozilgan bo'lsa) va testi bilan. Har bir dars bir marta (`autoPublishedAt`): mentor keyin uni
// qoralamaga olsa, qayta ochilmaydi. 5 daqiqalik cron chaqiradi. Bu fayl "use server" emas.

/** Jadval kiritilmagan guruhda dars shu vaqtdan ochiladi */
const FALLBACK_TIME = "08:00";

export async function autoPublishTodayLessons(now: Date = new Date()): Promise<{ published: number }> {
  await connectToDatabase();
  const todayKey = toDateKey(now);
  const lessons = await Lesson.find({
    isPublished: false,
    autoPublishedAt: null,
    date: { $gte: dateFromKey(todayKey), $lt: dateFromKey(addDaysToKey(todayKey, 1)) },
  })
    .select("groupId title homework")
    .lean();
  if (lessons.length === 0) return { published: 0 };

  const groups = await Group.find({ _id: { $in: [...new Set(lessons.map((l) => String(l.groupId)))] }, isActive: { $ne: false } })
    .select("schedule")
    .lean();
  const scheduleOf = new Map(groups.map((g) => [String(g._id), g.schedule]));

  let published = 0;
  for (const lesson of lessons) {
    if (!scheduleOf.has(String(lesson.groupId))) continue;
    const schedule = scheduleOf.get(String(lesson.groupId));
    const startsAt = dateFromKey(todayKey, isValidSchedule(schedule) ? schedule.startTime : FALLBACK_TIME);
    if (now.getTime() < startsAt.getTime()) continue;

    const hw = lesson.homework;
    const hasHomework = Boolean(hw && (hw.instructions?.trim() || (hw.attachments?.length ?? 0) > 0));
    const $set: Record<string, unknown> = { isPublished: true, autoPublishedAt: now };
    let dueAt = hw?.dueAt ? new Date(hw.dueAt) : null;
    if (hasHomework) {
      $set["homework.isEnabled"] = true;
      // Muddat yo'q yoki o'tib ketgan bo'lsa — kamida bir hafta (ochilishi bilan "kechikkan" bo'lib qolmasin)
      if (!dueAt || dueAt.getTime() <= now.getTime()) {
        dueAt = homeworkDueAfter(schedule, todayKey);
        $set["homework.dueAt"] = dueAt;
      }
    }
    // Shartli: shu orada mentor qo'lda ochgan yoki boshqa nusxa ochgan bo'lsa — tegilmaydi
    const res = await Lesson.updateOne({ _id: lesson._id, isPublished: false, autoPublishedAt: null }, { $set });
    if (res.modifiedCount === 0) continue;
    await Quiz.updateMany({ lessonId: lesson._id, isPublished: false }, { $set: { isPublished: true } });
    published++;
    notifyGroup(lesson.groupId, "lesson_new", {
      lessonId: String(lesson._id),
      lessonTitle: lesson.title,
      hasHomework,
      ...(hasHomework && dueAt ? { dueLabel: formatDateTimeUz(dueAt) } : {}),
    });
  }
  return { published };
}
