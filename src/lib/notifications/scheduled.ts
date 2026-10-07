import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Group } from "@/lib/db/models/group.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { User } from "@/lib/db/models/user.model";
import { Exam } from "@/lib/db/models/exam.model";
import { ExamSubmission } from "@/lib/db/models/exam-submission.model";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { isTelegramConfigured } from "@/lib/telegram/api";
import { addDaysToKey, dateFromKey, getTashkentParts, isValidSchedule } from "@/lib/schedule";
import { formatDateTimeUz } from "@/lib/utils";
import { sendNotifications } from "./notify";

// Vaqtga bog'liq bildirishnomalar: kunlik cron (/api/cron/daily), har 5 daqiqalik cron (/api/cron/reminders)
// va imtihon topshirilganda chaqiriladi.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Muddati keyingi 24 soat ichida tugaydigan vazifalar: hali topshirmagan o'quvchilarga eslatma.
 * Kuniga bir marta ishlagani uchun har bir vazifa faqat bitta "oyna"ga tushadi — eslatma takrorlanmaydi.
 */
export async function sendHomeworkDueReminders(now: Date = new Date()): Promise<{ lessons: number; sent: number }> {
  if (!isTelegramConfigured()) return { lessons: 0, sent: 0 };
  await connectToDatabase();

  const lessons = await Lesson.find({
    isPublished: true,
    "homework.isEnabled": true,
    "homework.dueAt": { $gt: now, $lte: new Date(now.getTime() + DAY_MS) },
  })
    .select("title groupId homework.dueAt")
    .lean();

  let sent = 0;
  for (const lesson of lessons) {
    const [students, done] = await Promise.all([
      User.find({ groupId: lesson.groupId, role: "student", "telegram.chatId": { $type: "string" } }).select("_id").lean(),
      // Qaytarilgan javob "topshirilmagan" hisoblanadi — unga ham eslatma boradi
      HomeworkSubmission.find({ lessonId: lesson._id, status: { $in: ["submitted", "graded"] } }).select("studentId").lean(),
    ]);
    const doneIds = new Set(done.map((d) => d.studentId.toString()));
    const pending = students.map((s) => s._id).filter((id) => !doneIds.has(id.toString()));
    if (pending.length === 0) continue;
    sent += await sendNotifications({ ids: pending }, "homework_due", {
      lessonId: lesson._id.toString(),
      lessonTitle: lesson.title,
      dueLabel: formatDateTimeUz(lesson.homework!.dueAt!),
    });
  }
  return { lessons: lessons.length, sent };
}

/**
 * Yakunlangan imtihonlar bo'yicha mentorga qisqa statistika.
 * Imtihon "yakunlangan" hisoblanadi: vaqti tugagan YOKI guruhdagi hamma o'quvchi topshirib bo'lgan.
 * `examId` berilsa faqat shu imtihon tekshiriladi.
 */
export async function notifyFinishedExams(examId?: string, now: Date = new Date()): Promise<number> {
  if (!isTelegramConfigured()) return 0;
  if (examId && !mongoose.isValidObjectId(examId)) return 0;
  await connectToDatabase();

  const exams = await Exam.find({
    isPublished: true,
    finishedNotifiedAt: null,
    // Juda eski imtihonlar uchun kechikkan xabar yuborilmaydi
    endTime: { $gt: new Date(now.getTime() - 14 * DAY_MS) },
    ...(examId ? { _id: examId } : {}),
  })
    .select("title groupIds endTime")
    .lean();

  let notified = 0;
  for (const exam of exams) {
    const [total, submissions] = await Promise.all([
      User.countDocuments({ role: "student", groupId: { $in: exam.groupIds } }),
      ExamSubmission.find({ examId: exam._id, status: { $in: ["submitted", "graded"] } })
        .select("studentId totalScore maxScore status")
        .lean(),
    ]);
    const submittedStudents = new Set(submissions.map((s) => s.studentId.toString())).size;
    const timeIsUp = new Date(exam.endTime).getTime() <= now.getTime();
    const everyoneDone = total > 0 && submittedStudents >= total;
    if (!timeIsUp && !everyoneDone) continue;

    // Avval belgilanadi: bir vaqtda ikki joydan chaqirilsa ham xabar bir marta ketadi
    const claimed = await Exam.updateOne({ _id: exam._id, finishedNotifiedAt: null }, { $set: { finishedNotifiedAt: now } });
    if (claimed.modifiedCount === 0) continue;

    const scored = submissions.filter((s) => s.maxScore > 0);
    await sendNotifications({ role: "mentor" }, "exam_finished", {
      examId: exam._id.toString(),
      title: exam.title,
      submitted: submittedStudents,
      total,
      avgPercent: scored.length > 0 ? Math.round(scored.reduce((sum, s) => sum + (s.totalScore / s.maxScore) * 100, 0) / scored.length) : null,
      ungraded: submissions.filter((s) => s.status === "submitted").length,
    });
    notified++;
  }
  return notified;
}

// Eslatma dars boshlanishiga shuncha daqiqa qolganda ketadi. Cron har 5 daqiqada ishlaydi va kechikishi mumkin,
// shuning uchun aniq bir daqiqa emas, oraliq olinadi: kechikkan chaqiruv ham eslatmani yuboradi.
const REMINDER_FROM_MIN = 65;
const REMINDER_UNTIL_MIN = 10;

/**
 * Darsi taxminan bir soatdan keyin boshlanadigan guruhlar: o'quvchilarga va mentorlarga eslatma.
 * Har bir guruhga kuniga bir marta ketadi (`lessonReminderSentFor`).
 */
export async function sendLessonReminders(now: Date = new Date()): Promise<{ groups: number; sent: number }> {
  if (!isTelegramConfigured()) return { groups: 0, sent: 0 };
  await connectToDatabase();

  const { dateKey, weekday } = getTashkentParts(now);
  const groups = await Group.find({ isActive: true, "schedule.days": weekday, lessonReminderSentFor: { $ne: dateKey } })
    .select("name schedule")
    .lean();

  let reminded = 0;
  let sent = 0;
  for (const group of groups) {
    if (!isValidSchedule(group.schedule)) continue;
    const { startTime, endTime } = group.schedule;
    const minutesLeft = Math.round((dateFromKey(dateKey, startTime).getTime() - now.getTime()) / 60_000);
    if (minutesLeft > REMINDER_FROM_MIN || minutesLeft < REMINDER_UNTIL_MIN) continue;

    // Avval belgilanadi: ikki chaqiruv ustma-ust tushsa ham eslatma bir marta ketadi
    const claimed = await Group.updateOne(
      { _id: group._id, lessonReminderSentFor: { $ne: dateKey } },
      { $set: { lessonReminderSentFor: dateKey } }
    );
    if (claimed.modifiedCount === 0) continue;
    reminded++;

    // Shu kunga dars kiritilgan bo'lsa, mavzusi ham ko'rsatiladi (o'quvchiga faqat nashr etilgani)
    const lessons = await Lesson.find({
      groupId: group._id,
      date: { $gte: dateFromKey(dateKey), $lt: dateFromKey(addDaysToKey(dateKey, 1)) },
    })
      .select("title isPublished")
      .sort({ order: 1 })
      .lean();
    const published = lessons.find((l) => l.isPublished);
    const forMentor = published ?? lessons[0];
    const base = { minutesLeft, startTime, endTime };

    const [toStudents, toMentors] = await Promise.all([
      sendNotifications({ groupId: group._id }, "lesson_reminder", {
        ...base,
        ...(published ? { lessonId: published._id.toString(), lessonTitle: published.title } : {}),
      }),
      sendNotifications({ role: "mentor" }, "lesson_reminder", {
        ...base,
        groupName: group.name,
        forMentor: true,
        ...(forMentor ? { lessonId: forMentor._id.toString(), lessonTitle: forMentor.title } : {}),
      }),
    ]);
    sent += toStudents + toMentors;
  }
  return { groups: reminded, sent };
}
