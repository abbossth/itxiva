"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import mongoose from "mongoose";
import { Lesson, ILesson, ILessonData } from "@/lib/db/models/lesson.model";
import { Group } from "@/lib/db/models/group.model";
import { Quiz } from "@/lib/db/models/quiz.model";
import { addDaysToKey, getLessonDatesInRange, getNextLessonAfter, toDateKey, type GroupSchedule } from "@/lib/schedule";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireAuth, requireGroupAccess } from "@/lib/auth/guards";
import { lessonSchema, homeworkSchema, HomeworkInput, LessonInput } from "@/lib/validations/lesson.schema";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import { notifyGroup } from "@/lib/notifications/notify";

export async function getLessonsByGroupAndQuarter({
  groupId,
  quarter,
}: {
  groupId: string;
  quarter: number;
}) {
  await connectToDatabase();
  const session = await requireAuth();

  // If student, enforce group ownership and only published lessons
  if (session.role === "student") {
    await requireGroupAccess(groupId);
    const lessons = await Lesson.find({
      groupId,
      quarter,
      isPublished: true,
    })
      .sort({ order: 1 })
      .lean();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const parsed = JSON.parse(JSON.stringify(lessons)) as ILessonData[];
    return parsed.map((l) => ({
      ...l,
      isNew: l.createdAt ? new Date(l.createdAt).getTime() > oneWeekAgo : false,
    }));
  }

  // Mentor gets both published and draft lessons
  const lessons = await Lesson.find({ groupId, quarter }).sort({ order: 1 }).lean();
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const parsed = JSON.parse(JSON.stringify(lessons)) as ILessonData[];
  return parsed.map((l) => ({
    ...l,
    isNew: l.createdAt ? new Date(l.createdAt).getTime() > oneWeekAgo : false,
  }));
}

export async function getLessonById(lessonId: string) {
  await connectToDatabase();
  const session = await requireAuth();

  const lesson = await Lesson.findById(lessonId).lean();
  if (!lesson) return null;

  if (session.role === "student") {
    await requireGroupAccess(lesson.groupId.toString());
    if (!lesson.isPublished) {
      throw new Error("Dars hali nashr etilmagan");
    }
  }

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const parsed = JSON.parse(JSON.stringify(lesson)) as ILessonData;
  return {
    ...parsed,
    isNew: parsed.createdAt ? new Date(parsed.createdAt).getTime() > oneWeekAgo : false,
  };
}

/** Formadan kelgan vazifani bazaga yoziladigan ko'rinishga keltiradi (faqat fayl biriktirmalar, sana Date) */
function normalizeHomework(input: HomeworkInput | null | undefined) {
  if (!input) return null;
  const due = input.dueAt ? new Date(input.dueAt) : null;
  return {
    isEnabled: input.isEnabled,
    instructions: input.instructions,
    attachments: input.attachments.filter((a) => a.type === "file"),
    dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
    coinsReward: input.coinsReward,
  };
}

/** Guruh o'quvchilariga "yangi dars" xabari */
function announceLesson(lesson: Pick<ILesson, "_id" | "groupId" | "title" | "homework">) {
  notifyGroup(lesson.groupId, "lesson_new", {
    lessonId: lesson._id.toString(),
    lessonTitle: lesson.title,
    hasHomework: Boolean(lesson.homework?.isEnabled),
  });
}

/** Nashr etilgan darsga qo'shilgan yangi materiallar haqida xabar (har biri uchun alohida emas — bitta xabar) */
function announceNewMaterials(lesson: Pick<ILesson, "_id" | "groupId" | "title" | "materials">, previousKeys: Set<string>) {
  const added = lesson.materials.filter((m) => !previousKeys.has(m.urlOrKey));
  if (added.length === 0) return;
  notifyGroup(lesson.groupId, "material_new", {
    lessonId: lesson._id.toString(),
    lessonTitle: lesson.title,
    materialTitle: added.length === 1 ? added[0].title : `${added[0].title} va yana ${added.length - 1} ta`,
  });
}

export async function createLessonAction(input: LessonInput) {
  const mentor = await requireMentor();
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Ma'lumotlar noto'g'ri", errors: parsed.error.flatten().fieldErrors };
  }

  await connectToDatabase();

  // Determine next order number in this quarter
  const lastLesson = await Lesson.findOne({
    groupId: parsed.data.groupId,
    quarter: parsed.data.quarter,
  }).sort({ order: -1 });

  const order = lastLesson ? lastLesson.order + 1 : 1;

  const lesson = await Lesson.create({
    ...parsed.data,
    homework: normalizeHomework(parsed.data.homework),
    order: parsed.data.order || order,
    date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
  });

  await AuditLog.create({
    actorId: mentor.userId,
    action: "CREATE_LESSON",
    details: { lessonId: lesson._id, title: lesson.title, groupId: lesson.groupId },
  });

  if (lesson.isPublished) announceLesson(lesson);

  revalidatePath("/lessons");
  revalidatePath("/mentor/lessons");
  return { success: true, message: "Dars muvaffaqiyatli yaratildi", data: JSON.parse(JSON.stringify(lesson)) };
}

export async function updateLessonAction(lessonId: string, input: Partial<LessonInput>) {
  const mentor = await requireMentor();
  await connectToDatabase();

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) {
    return { success: false, message: "Dars topilmadi" };
  }

  const wasPublished = lesson.isPublished;
  const previousMaterialKeys = new Set(lesson.materials.map((m) => m.urlOrKey));

  if (input.groupId && input.groupId !== lesson.groupId.toString()) {
    lesson.groupId = input.groupId as unknown as typeof lesson.groupId;
  }
  if (input.order) lesson.order = input.order;
  if (input.title) lesson.title = input.title;
  if (input.topic !== undefined) lesson.topic = input.topic;
  if (input.description !== undefined) lesson.description = input.description;
  if (input.quarter) lesson.quarter = input.quarter;
  if (input.date) lesson.date = new Date(input.date);
  if (input.isPublished !== undefined) lesson.isPublished = input.isPublished;
  if (input.materials) lesson.materials = input.materials as unknown as typeof lesson.materials;
  if (input.homework !== undefined) {
    const parsedHomework = homeworkSchema.nullable().safeParse(input.homework);
    if (!parsedHomework.success) {
      return { success: false, message: parsedHomework.error.issues[0].message };
    }
    if (parsedHomework.data?.isEnabled && !parsedHomework.data.instructions && parsedHomework.data.attachments.length === 0) {
      return { success: false, message: "Uyga vazifa matnini yozing yoki fayl biriktiring" };
    }
    lesson.homework = normalizeHomework(parsedHomework.data) as unknown as typeof lesson.homework;
  }

  await lesson.save();
  if (lesson.isPublished && !wasPublished) announceLesson(lesson);
  else if (lesson.isPublished) announceNewMaterials(lesson, previousMaterialKeys);
  const syncedCount = await syncLinkedLessons(lesson);

  await AuditLog.create({
    actorId: mentor.userId,
    action: "UPDATE_LESSON",
    details: { lessonId: lesson._id, title: lesson.title, syncedCopies: syncedCount },
  });

  revalidatePath("/", "layout");
  revalidatePath("/lessons");
  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/mentor/lessons");
  return {
    success: true,
    message: syncedCount > 0 ? `Dars yangilandi (${syncedCount} ta bog'langan guruhda ham)` : "Dars yangilandi",
    data: JSON.parse(JSON.stringify(lesson)),
  };
}

export async function togglePublishLessonAction(lessonId: string) {
  const mentor = await requireMentor();
  await connectToDatabase();

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) {
    return { success: false, message: "Dars topilmadi" };
  }

  lesson.isPublished = !lesson.isPublished;
  await lesson.save();
  if (lesson.isPublished) announceLesson(lesson);

  await AuditLog.create({
    actorId: mentor.userId,
    action: lesson.isPublished ? "PUBLISH_LESSON" : "UNPUBLISH_LESSON",
    details: { lessonId: lesson._id, title: lesson.title, isPublished: lesson.isPublished },
  });

  revalidatePath("/lessons");
  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/mentor/lessons");
  return {
    success: true,
    message: lesson.isPublished ? "Dars nashr etildi" : "Dars qoralamaga olindi",
    isPublished: lesson.isPublished,
  };
}

export async function deleteLessonAction(lessonId: string) {
  const mentor = await requireMentor();
  await connectToDatabase();

  const lesson = await Lesson.findByIdAndDelete(lessonId);
  if (lesson) {
    await Promise.all([
      HomeworkSubmission.deleteMany({ lessonId: lesson._id }),
      Quiz.deleteMany({ lessonId: lesson._id }),
    ]);
    if (lesson.linkId) {
      const rest = await Lesson.find({ linkId: lesson.linkId }).select("_id").lean();
      if (rest.length === 1) await Lesson.updateOne({ _id: rest[0]._id }, { $set: { linkId: null } });
    }
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: "DELETE_LESSON",
    details: { lessonId, title: lesson?.title },
  });

  revalidatePath("/lessons");
  revalidatePath("/mentor/lessons");
  return { success: true, message: "Dars o'chirildi" };
}

export async function reorderLessonsAction({
  orderedIds,
}: {
  groupId: string;
  quarter: number;
  orderedIds: string[];
}) {
  await requireMentor();
  await connectToDatabase();

  const bulkOps = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { order: index + 1 } },
    },
  }));

  if (bulkOps.length > 0) {
    await Lesson.bulkWrite(bulkOps);
  }

  revalidatePath("/lessons");
  revalidatePath("/mentor/lessons");
  return { success: true, message: "Darslar tartibi yangilandi" };
}

/**
 * Generate secure presigned GET URL to view or download private R2 material
 */
export async function getMaterialDownloadUrlAction({
  lessonId,
  materialKey,
}: {
  lessonId: string;
  materialKey: string;
}): Promise<{ success: boolean; downloadUrl?: string; message?: string }> {
  await connectToDatabase();
  const session = await requireAuth();

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) {
    return { success: false, message: "Dars topilmadi" };
  }

  // IDOR protection: check student group
  if (session.role === "student") {
    await requireGroupAccess(lesson.groupId.toString());
    if (!lesson.isPublished) {
      return { success: false, message: "Dars hali nashr etilmagan" };
    }
  }

  // Verify material belongs to this lesson
  const material =
    lesson.materials.find((m) => m.urlOrKey === materialKey) ??
    lesson.homework?.attachments?.find((m) => m.urlOrKey === materialKey);
  if (!material) {
    return { success: false, message: "Material topilmadi" };
  }

  try {
    const downloadUrl = await getDownloadPresignedUrl({ key: materialKey });
    return { success: true, downloadUrl };
  } catch (error) {
    console.error("Presigned URL error:", error);
    return { success: false, message: "Faylga kirishda xatolik yuz berdi" };
  }
}

/* ------------------------------------------------------------------ */
/* Bog'langan nusxalar: bitta dars — bir nechta guruh                   */
/* ------------------------------------------------------------------ */
// Har bir guruhda darsning o'z nusxasi bo'ladi (o'z sanasi, tartibi, nashr holati, vazifa muddati,
// o'quvchilar javoblari va baholari bilan). Mazmun — sarlavha, konspekt, materiallar, vazifa matni va test —
// bog'langan nusxalarda birga yangilanadi. Shu sabab bir guruhdagi javoblar boshqasinikiga aralashmaydi.

/** Guruh jadvali bo'yicha berilgan sanadan boshlab birinchi dars kuni; jadval bo'lmasa o'sha sana */
function alignDateToSchedule(schedule: Partial<GroupSchedule> | null | undefined, date: Date): Date {
  const key = toDateKey(date);
  const [first] = getLessonDatesInRange(schedule, key, addDaysToKey(key, 6));
  return first ? new Date(first) : date;
}

/** Saqlangan darsning mazmunini bog'langan nusxalarga ko'chiradi. Nusxalar soni qaytadi */
async function syncLinkedLessons(lesson: ILesson): Promise<number> {
  if (!lesson.linkId) return 0;
  const siblings = await Lesson.find({ linkId: lesson.linkId, _id: { $ne: lesson._id } });
  if (siblings.length === 0) return 0;

  const groups = await Group.find({ _id: { $in: siblings.map((s) => s.groupId) } }).select("schedule").lean();
  const scheduleOf = new Map(groups.map((g) => [g._id.toString(), g.schedule]));
  const source = lesson.toObject();

  for (const sib of siblings) {
    const siblingMaterialKeys = new Set(sib.materials.map((m) => m.urlOrKey));
    sib.title = source.title;
    sib.topic = source.topic;
    sib.description = source.description;
    sib.materials = source.materials as typeof sib.materials;

    if (source.homework) {
      // Muddat har guruhda o'ziniki: bor bo'lsa saqlanadi, yo'q bo'lsa o'sha guruh jadvalidan olinadi
      const ownDue = sib.homework?.dueAt ?? null;
      const due =
        ownDue ??
        (source.homework.isEnabled && sib.date
          ? getNextLessonAfter(scheduleOf.get(sib.groupId.toString()), toDateKey(sib.date))
          : null);
      sib.homework = {
        isEnabled: source.homework.isEnabled,
        instructions: source.homework.instructions,
        attachments: source.homework.attachments,
        coinsReward: source.homework.coinsReward,
        dueAt: due,
      } as typeof sib.homework;
    } else if (sib.homework) {
      sib.homework.isEnabled = false;
    }

    await sib.save();
    if (sib.isPublished) announceNewMaterials(sib, siblingMaterialKeys);
    revalidatePath(`/lessons/${sib._id}`);
  }
  return siblings.length;
}

export interface LinkedLessonInfo {
  _id: string;
  groupId: string;
  groupName: string;
  grade: number | null;
  date: string | null;
  isPublished: boolean;
}

/** Shu dars bilan bog'langan boshqa guruhlardagi nusxalar */
export async function getLinkedLessons(lessonId: string): Promise<LinkedLessonInfo[]> {
  await requireMentor();
  if (!mongoose.isValidObjectId(lessonId)) return [];
  await connectToDatabase();

  const lesson = await Lesson.findById(lessonId).select("linkId").lean();
  if (!lesson?.linkId) return [];
  const siblings = await Lesson.find({ linkId: lesson.linkId, _id: { $ne: lesson._id } })
    .select("groupId date isPublished")
    .lean();
  const groups = await Group.find({ _id: { $in: siblings.map((s) => s.groupId) } }).select("name grade").lean();
  const groupOf = new Map(groups.map((g) => [g._id.toString(), g]));

  return siblings
    .map((s) => {
      const g = groupOf.get(s.groupId.toString());
      return {
        _id: s._id.toString(),
        groupId: s.groupId.toString(),
        groupName: g?.name ?? "O'chirilgan guruh",
        grade: g?.grade ?? null,
        date: s.date ? new Date(s.date).toISOString() : null,
        isPublished: s.isPublished,
      };
    })
    .sort((a, b) => a.groupName.localeCompare(b.groupName));
}

/** Darsni boshqa guruhlarga ham qo'shadi: har biriga bog'langan nusxa (testi bilan) yaratiladi */
export async function copyLessonToGroupsAction(params: { lessonId: string; groupIds: string[] }) {
  const mentor = await requireMentor();
  const groupIds = [...new Set((params.groupIds ?? []).filter((id) => mongoose.isValidObjectId(id)))];
  if (!mongoose.isValidObjectId(params.lessonId) || groupIds.length === 0) {
    return { success: false, message: "Guruh tanlanmagan" };
  }
  await connectToDatabase();

  const lesson = await Lesson.findById(params.lessonId);
  if (!lesson) return { success: false, message: "Dars topilmadi" };

  if (!lesson.linkId) {
    lesson.linkId = lesson._id;
    await lesson.save();
  }

  // Shu dars allaqachon bor guruhlarga (o'zining guruhi ham) ikkinchi nusxa yaratilmaydi
  const existing = await Lesson.find({ linkId: lesson.linkId }).select("groupId").lean();
  const taken = new Set(existing.map((l) => l.groupId.toString()));
  const targets = await Group.find({ _id: { $in: groupIds.filter((id) => !taken.has(id)) } })
    .select("name schedule")
    .lean();
  if (targets.length === 0) {
    return { success: false, message: "Tanlangan guruhlarda bu dars allaqachon bor" };
  }

  const source = lesson.toObject();
  const quiz = await Quiz.findOne({ lessonId: lesson._id }).lean();
  const created: string[] = [];

  for (const group of targets) {
    const last = await Lesson.findOne({ groupId: group._id, quarter: source.quarter }).sort({ order: -1 }).select("order").lean();
    const date = alignDateToSchedule(group.schedule, source.date ? new Date(source.date) : new Date());

    const copy = await Lesson.create({
      groupId: group._id,
      quarter: source.quarter,
      order: last ? last.order + 1 : 1,
      title: source.title,
      topic: source.topic,
      description: source.description,
      date,
      isPublished: source.isPublished,
      materials: source.materials.map((m) => ({
        type: m.type,
        title: m.title,
        urlOrKey: m.urlOrKey,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
      })),
      homework: source.homework
        ? {
            isEnabled: source.homework.isEnabled,
            instructions: source.homework.instructions,
            attachments: source.homework.attachments,
            coinsReward: source.homework.coinsReward,
            dueAt: source.homework.isEnabled
              ? getNextLessonAfter(group.schedule, toDateKey(date)) ?? source.homework.dueAt ?? null
              : null,
          }
        : null,
      linkId: lesson.linkId,
    });

    if (copy.isPublished) announceLesson(copy);

    if (quiz) {
      await Quiz.create({
        lessonId: copy._id,
        title: quiz.title,
        description: quiz.description,
        questions: quiz.questions,
        isPublished: quiz.isPublished,
        passingScore: quiz.passingScore,
      });
    }
    created.push(group.name);
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: "COPY_LESSON_TO_GROUPS",
    details: { lessonId: lesson._id, title: lesson.title, groups: created },
  });

  revalidatePath("/", "layout");
  revalidatePath("/lessons");
  revalidatePath("/mentor/lessons");
  return { success: true, message: `Dars ${created.join(", ")} guruhiga ham qo'shildi`, created };
}

/** Darsni bog'lanishdan chiqaradi: keyingi o'zgarishlar boshqa guruhlarga o'tmaydi */
export async function unlinkLessonAction(lessonId: string) {
  const mentor = await requireMentor();
  if (!mongoose.isValidObjectId(lessonId)) return { success: false, message: "Dars topilmadi" };
  await connectToDatabase();

  const lesson = await Lesson.findById(lessonId);
  if (!lesson) return { success: false, message: "Dars topilmadi" };
  if (!lesson.linkId) return { success: true, message: "Dars bog'lanmagan" };

  const linkId = lesson.linkId;
  lesson.linkId = null;
  await lesson.save();

  // Bog'lanishda bitta dars qolsa, u ham mustaqil bo'ladi
  const rest = await Lesson.find({ linkId }).select("_id").lean();
  if (rest.length === 1) {
    await Lesson.updateOne({ _id: rest[0]._id }, { $set: { linkId: null } });
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: "UNLINK_LESSON",
    details: { lessonId: lesson._id, title: lesson.title },
  });

  revalidatePath("/mentor/lessons");
  return { success: true, message: "Bog'lanish uzildi — bu dars endi mustaqil" };
}
