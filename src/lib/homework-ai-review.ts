import mongoose from "mongoose";
import { AI_READABLE_TYPES } from "@/lib/ai/claude";
import { reviewHomeworkWithAi, type HomeworkReview, type HomeworkReviewInput } from "@/lib/ai/review-homework";
import { downloadBuffer } from "@/lib/storage/r2";
import { connectToDatabase } from "@/lib/db/connect";
import { HomeworkSubmission } from "@/lib/db/models/homework-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { Group } from "@/lib/db/models/group.model";
import { findSimilarSubmissions } from "@/lib/homework-integrity";

// Uyga vazifa javobini AI bilan ko'rib chiqish: mentorning "AI bilan tekshirish" tugmasi ham, javob yuborilgach
// fonda ishlaydigan avtomatik baholash ham shu yerdan foydalanadi. Natija keshlanadi (bir xil javob — bir so'rov).

const REVIEW_MAX_FILES = 6;
const REVIEW_MAX_FILE_BYTES = 5 * 1024 * 1024;
const REVIEW_MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export interface SimilarSubmission {
  studentId: string;
  fullName: string;
  groupName: string;
  lessonId: string;
  percent: number;
}

export type HomeworkReviewResult = HomeworkReview & { similar: SimilarSubmission[] };

export type ReviewOutcome = { ok: true; review: HomeworkReviewResult } | { ok: false; message: string; unreadable?: boolean };

/** Javobni AI'ga ko'rsatadi. AI xatosi (band, limit, hudud) — AiError bo'lib otiladi */
export async function reviewSubmission(
  submissionId: string,
  { fresh = false, deadlineMs }: { fresh?: boolean; deadlineMs?: number } = {}
): Promise<ReviewOutcome> {
  if (!mongoose.isValidObjectId(submissionId)) return { ok: false, message: "Javob topilmadi" };
  await connectToDatabase();
  const submission = await HomeworkSubmission.findById(submissionId).select("lessonId studentId text links files attempt").lean();
  if (!submission) return { ok: false, message: "Javob topilmadi" };
  const lesson = await Lesson.findById(submission.lessonId).select("title topic groupId homework linkId").lean();
  if (!lesson) return { ok: false, message: "Dars topilmadi" };
  const group = await Group.findById(lesson.groupId).select("grade").lean();

  const candidates = [
    ...(lesson.homework?.attachments ?? [])
      .filter((a) => a.type === "file")
      .map((a) => ({ key: a.urlOrKey, name: a.title, mimeType: a.mimeType, size: a.fileSize, source: "task" as const })),
    ...(submission.files ?? []).map((f) => ({ ...f, source: "student" as const })),
  ];

  const files: HomeworkReviewInput["files"] = [];
  const unreadFiles: string[] = [];
  let totalBytes = 0;
  for (const f of candidates) {
    const readable =
      AI_READABLE_TYPES.includes(f.mimeType ?? "") &&
      files.length < REVIEW_MAX_FILES &&
      (f.size ?? 0) <= REVIEW_MAX_FILE_BYTES &&
      totalBytes + (f.size ?? 0) <= REVIEW_MAX_TOTAL_BYTES;
    if (!readable) {
      if (f.source === "student") unreadFiles.push(f.name);
      continue;
    }
    try {
      const buffer = await downloadBuffer(f.key);
      if (buffer.length > REVIEW_MAX_FILE_BYTES || totalBytes + buffer.length > REVIEW_MAX_TOTAL_BYTES) {
        if (f.source === "student") unreadFiles.push(f.name);
        continue;
      }
      totalBytes += buffer.length;
      files.push({ mimeType: f.mimeType!, data: buffer.toString("base64"), name: f.name, source: f.source });
    } catch (error) {
      console.error("AI review file download failed:", error);
      if (f.source === "student") unreadFiles.push(f.name);
    }
  }

  const studentText = submission.text ?? "";
  if (!studentText.trim() && !files.some((f) => f.source === "student")) {
    return {
      ok: false,
      unreadable: true,
      message: "AI bu javobni o'qiy olmaydi: matn yo'q, fayllar esa rasm yoki PDF emas. Javobni o'zingiz tekshiring",
    };
  }

  const instructions = lesson.homework?.instructions ?? "";
  const [similar, previous] = await Promise.all([
    findSimilarSubmissions(submission, lesson, instructions),
    HomeworkSubmission.find({ studentId: submission.studentId, _id: { $ne: submission._id }, text: { $ne: "" } })
      .sort({ submittedAt: -1 })
      .limit(3)
      .select("text")
      .lean(),
  ]);

  const review = await reviewHomeworkWithAi(
    {
      lessonTitle: lesson.title,
      lessonTopic: lesson.topic ?? "",
      grade: group?.grade ?? null,
      instructions,
      studentText,
      links: submission.links ?? [],
      attempt: submission.attempt ?? 1,
      files,
      unreadFiles,
      // AI'ga boshqa o'quvchilarning ismi yuborilmaydi
      similarAnswers: similar.map((s) => ({ percent: s.percent, text: s.text })),
      previousAnswers: previous.map((p) => p.text ?? "").filter((t) => t.trim()),
    },
    { fresh, deadlineMs }
  );
  return {
    ok: true,
    review: {
      ...review,
      similar: similar.map((s) => ({
        studentId: s.studentId.toString(),
        fullName: s.fullName,
        groupName: s.groupName,
        lessonId: s.lessonId.toString(),
        percent: s.percent,
      })),
    },
  };
}
