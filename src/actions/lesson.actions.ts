"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Lesson, ILessonData } from "@/lib/db/models/lesson.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireAuth, requireGroupAccess } from "@/lib/auth/guards";
import { lessonSchema, LessonInput } from "@/lib/validations/lesson.schema";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";

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
    order: parsed.data.order || order,
    date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
  });

  await AuditLog.create({
    actorId: mentor.userId,
    action: "CREATE_LESSON",
    details: { lessonId: lesson._id, title: lesson.title, groupId: lesson.groupId },
  });

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

  await lesson.save();

  await AuditLog.create({
    actorId: mentor.userId,
    action: "UPDATE_LESSON",
    details: { lessonId: lesson._id, title: lesson.title },
  });

  revalidatePath("/lessons");
  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/mentor/lessons");
  return { success: true, message: "Dars yangilandi", data: JSON.parse(JSON.stringify(lesson)) };
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
  const material = lesson.materials.find((m) => m.urlOrKey === materialKey);
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
