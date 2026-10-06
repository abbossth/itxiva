import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { Exam } from "@/lib/db/models/exam.model";
import { ExamSubmission } from "@/lib/db/models/exam-submission.model";
import { getUploadPresignedUrl, ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/storage/r2";

function cleanFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 8);
}

export async function POST(req: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Tizimga kirilmagan" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { filename, contentType, fileSize, examId, questionId } = body as {
      filename?: string;
      contentType?: string;
      fileSize?: number;
      examId?: string;
      questionId?: string;
    };

    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "Fayl nomi talab qilinadi" }, { status: 400 });
    }

    // O'quvchi: faqat o'zi yechayotgan imtihonning "loyiha yuklash" savoli uchun
    if (session.role === "student") {
      if (!examId || !questionId) {
        return NextResponse.json({ error: "Ruxsat berilmagan" }, { status: 403 });
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

      const maxBytes = (question.maxFileSizeMb || 50) * 1024 * 1024;
      if (typeof fileSize !== "number" || fileSize <= 0 || fileSize > maxBytes) {
        return NextResponse.json(
          { error: `Fayl hajmi ${question.maxFileSizeMb || 50} MB dan oshmasligi kerak` },
          { status: 400 }
        );
      }

      const key = `exams/${exam._id}/${session.userId}/${Date.now()}-${randomSuffix()}-${cleanFilename(filename)}`;
      const { uploadUrl } = await getUploadPresignedUrl({
        key,
        contentType: contentType || "application/octet-stream",
        skipTypeCheck: true,
      });

      return NextResponse.json({ uploadUrl, key });
    }

    // Mentor: dars materiallari
    if (!contentType) {
      return NextResponse.json({ error: "Fayl turi talab qilinadi" }, { status: 400 });
    }

    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "Ruxsat etilmagan fayl turi" }, { status: 400 });
    }

    if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
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
    });

    return NextResponse.json({
      uploadUrl,
      key,
      publicUrl: key,
    });
  } catch (error: unknown) {
    console.error("Presigned URL error:", error);
    return NextResponse.json({ error: "Serverda xatolik yuz berdi" }, { status: 500 });
  }
}
