import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/guards";
import { getUploadPresignedUrl, ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/storage/r2";

export async function POST(req: NextRequest) {
  try {
    // Only mentor is authorized to upload materials in Phase 1
    await requireMentor();

    const body = await req.json();
    const { filename, contentType, fileSize } = body;

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "Fayl nomi va turi talab qilinadi" },
        { status: 400 }
      );
    }

    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "Ruxsat etilmagan fayl turi" },
        { status: 400 }
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Fayl hajmi 100 MB dan oshmasligi kerak" },
        { status: 400 }
      );
    }

    // Generate safe key: materials/{timestamp}-{random}-{cleanFilename}
    const cleanName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `materials/${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanName}`;

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
    const msg = error instanceof Error ? error.message : "Serverda xatolik yuz berdi";
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}
