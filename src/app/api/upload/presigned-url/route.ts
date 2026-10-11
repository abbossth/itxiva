import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { Exam } from "@/lib/db/models/exam.model";
import { ExamSubmission } from "@/lib/db/models/exam-submission.model";
import { Lesson } from "@/lib/db/models/lesson.model";
import { checkRateLimit } from "@/lib/rate-limit";
import { HOMEWORK_BLOCKED_EXTENSIONS, HOMEWORK_MAX_FILE_MB, STUDENT_MAX_UPLOAD_MB } from "@/lib/homework-status";
import { getUploadPresignedUrl, ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/storage/r2";

function cleanFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

// Fayl kaliti taxmin qilib bo'lmaydigan bo'lishi uchun kriptografik tasodifiy qo'shimcha
function randomSuffix(): string {
  return crypto.randomBytes(9).toString("base64url");
}

// O'quvchi yuborgan MIME turi omborga yoziladi va faylni ochganda brauzerga qaytadi.
// Brauzerda bajariladigan turlar (HTML, SVG, skript) oddiy yuklab olinadigan faylga aylantiriladi.
const ACTIVE_CONTENT_TYPE = /html|xml|svg|javascript|ecmascript/i;
function safeContentType(contentType: unknown): string {
  if (typeof contentType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType) || ACTIVE_CONTENT_TYPE.test(contentType)) {
    return "application/octet-stream";
  }
  return contentType;
}

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function isValidSize(fileSize: unknown, maxBytes: number): fileSize is number {
  return typeof fileSize === "number" && Number.isInteger(fileSize) && fileSize > 0 && fileSize <= maxBytes;
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Tizimga kirilmagan" }, { status: 401 });
  }
  if (session.mustChangePassword) {
    return NextResponse.json({ error: "Avval parolni almashtiring" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { filename, contentType, fileSize, examId, questionId, homeworkLessonId, avatarStudentId } = body as {
      filename?: string;
      contentType?: string;
      fileSize?: number;
      examId?: string;
      questionId?: string;
      homeworkLessonId?: string;
      avatarStudentId?: string;
    };

    if (!filename || typeof filename !== "string" || filename.length > 300) {
      return NextResponse.json({ error: "Fayl nomi talab qilinadi" }, { status: 400 });
    }

    // O'quvchi: o'z guruhidagi darsning uyga vazifasi uchun javob fayli
    if (session.role === "student" && homeworkLessonId) {
      if (!mongoose.isValidObjectId(homeworkLessonId)) {
        return NextResponse.json({ error: "Dars topilmadi" }, { status: 404 });
      }
      const rate = checkRateLimit(`hw_upload_${session.userId}`, 30, 10 * 60 * 1000);
      if (!rate.allowed) {
        return NextResponse.json({ error: "Juda ko'p fayl yuklandi. Birozdan keyin urinib ko'ring" }, { status: 429 });
      }

      await connectToDatabase();
      const lesson = await Lesson.findById(homeworkLessonId).select("groupId isPublished homework").lean();
      if (
        !lesson ||
        !lesson.isPublished ||
        !lesson.homework?.isEnabled ||
        !session.groupId ||
        lesson.groupId.toString() !== session.groupId
      ) {
        return NextResponse.json({ error: "Uyga vazifa topilmadi" }, { status: 404 });
      }

      const extension = filename.includes(".") ? `.${filename.split(".").pop()!.toLowerCase()}` : "";
      if (HOMEWORK_BLOCKED_EXTENSIONS.includes(extension)) {
        return NextResponse.json({ error: `${extension} turidagi fayl qabul qilinmaydi` }, { status: 400 });
      }

      if (!isValidSize(fileSize, HOMEWORK_MAX_FILE_MB * 1024 * 1024)) {
        return NextResponse.json(
          { error: `Fayl hajmi ${HOMEWORK_MAX_FILE_MB} MB dan oshmasligi kerak` },
          { status: 400 }
        );
      }

      const key = `homework/${homeworkLessonId}/${session.userId}/${Date.now()}-${randomSuffix()}-${cleanFilename(filename)}`;
      const safeType = safeContentType(contentType);
      const { uploadUrl } = await getUploadPresignedUrl({
        key,
        contentType: safeType,
        contentLength: fileSize,
        skipTypeCheck: true,
      });

      return NextResponse.json({ uploadUrl, key, contentType: safeType });
    }

    // O'quvchi: faqat o'zi yechayotgan imtihonning "loyiha yuklash" savoli uchun
    if (session.role === "student") {
      if (!examId || !questionId) {
        return NextResponse.json({ error: "Ruxsat berilmagan" }, { status: 403 });
      }
      if (!mongoose.isValidObjectId(examId) || typeof questionId !== "string") {
        return NextResponse.json({ error: "Imtihon topilmadi" }, { status: 404 });
      }
      const rate = checkRateLimit(`exam_upload_${session.userId}`, 30, 10 * 60 * 1000);
      if (!rate.allowed) {
        return NextResponse.json({ error: "Juda ko'p fayl yuklandi. Birozdan keyin urinib ko'ring" }, { status: 429 });
      }

      await connectToDatabase();
      const exam = await Exam.findById(examId);
      const isMember = exam?.groupIds.some((g) => String(g) === session.groupId);
      if (!exam || !exam.isPublished || !isMember) {
        return NextResponse.json({ error: "Imtihon topilmadi" }, { status: 404 });
      }

      const question = exam.questions.find((q) => q._id?.toString() === questionId);
      if (!question || question.type !== "project_upload") {
        return NextResponse.json({ error: "Savol topilmadi" }, { status: 404 });
      }

      const activeAttempt = await ExamSubmission.exists({
        examId: exam._id,
        studentId: session.userId,
        status: "in_progress",
      });
      if (!activeAttempt) {
        return NextResponse.json({ error: "Faol imtihon urinishi topilmadi" }, { status: 403 });
      }

      const extension = filename.includes(".") ? `.${filename.split(".").pop()!.toLowerCase()}` : "";
      const allowedExtensions = (question.allowedFileTypes || []).map((t) => t.toLowerCase());
      if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
        return NextResponse.json(
          { error: `Ruxsat etilgan fayl turlari: ${allowedExtensions.join(", ")}` },
          { status: 400 }
        );
      }

      // Savolda kattaroq chegara qo'yilgan bo'lsa ham, o'quvchi fayli umumiy chegaradan oshmaydi
      const maxMb = Math.min(question.maxFileSizeMb || STUDENT_MAX_UPLOAD_MB, STUDENT_MAX_UPLOAD_MB);
      if (!isValidSize(fileSize, maxMb * 1024 * 1024)) {
        return NextResponse.json({ error: `Fayl hajmi ${maxMb} MB dan oshmasligi kerak` }, { status: 400 });
      }

      const key = `exams/${exam._id}/${session.userId}/${Date.now()}-${randomSuffix()}-${cleanFilename(filename)}`;
      const safeType = safeContentType(contentType);
      const { uploadUrl } = await getUploadPresignedUrl({
        key,
        contentType: safeType,
        contentLength: fileSize,
        skipTypeCheck: true,
      });

      return NextResponse.json({ uploadUrl, key, contentType: safeType });
    }

    // Mentor: o'quvchi profilining rasmi (brauzerda WebP ga siqilgan holda keladi)
    if (avatarStudentId !== undefined) {
      if (typeof avatarStudentId !== "string" || !mongoose.isValidObjectId(avatarStudentId)) {
        return NextResponse.json({ error: "O'quvchi topilmadi" }, { status: 404 });
      }
      if (typeof contentType !== "string" || !AVATAR_TYPES.includes(contentType)) {
        return NextResponse.json({ error: "Faqat rasm (JPG, PNG, WebP) yuklash mumkin" }, { status: 400 });
      }
      if (!isValidSize(fileSize, AVATAR_MAX_BYTES)) {
        return NextResponse.json({ error: "Rasm hajmi 5 MB dan oshmasligi kerak" }, { status: 400 });
      }
      const key = `avatars/${avatarStudentId}/${Date.now()}-${randomSuffix()}-${cleanFilename(filename)}`;
      const { uploadUrl } = await getUploadPresignedUrl({ key, contentType, contentLength: fileSize });
      return NextResponse.json({ uploadUrl, key, contentType });
    }

    // Mentor: dars materiallari
    if (!contentType) {
      return NextResponse.json({ error: "Fayl turi talab qilinadi" }, { status: 400 });
    }

    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "Ruxsat etilmagan fayl turi" }, { status: 400 });
    }

    if (!isValidSize(fileSize, MAX_FILE_SIZE_BYTES)) {
      return NextResponse.json(
        { error: "Fayl hajmi 100 MB dan oshmasligi kerak" },
        { status: 400 }
      );
    }

    // Generate safe key: materials/{timestamp}-{random}-{cleanFilename}
    const key = `materials/${Date.now()}-${randomSuffix()}-${cleanFilename(filename)}`;

    const { uploadUrl } = await getUploadPresignedUrl({
      key,
      contentType,
      contentLength: fileSize,
    });

    return NextResponse.json({
      uploadUrl,
      key,
      contentType,
      publicUrl: key,
    });
  } catch (error: unknown) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: "Serverda xatolik yuz berdi" }, { status: 500 });
  }
}
