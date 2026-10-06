// Brauzerdan Cloudflare R2 ga fayl yuklash (presigned PUT URL orqali)

/**
 * Compress image to WebP with max 1600px dimension using Canvas (in-browser)
 */
export async function compressImageToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;

    img.onload = () => {
      let { width, height } = img;
      const maxDim = 1600;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        "image/webp",
        0.85
      );
    };

    reader.readAsDataURL(file);
  });
}

export interface UploadedFile {
  key: string;
  contentType: string;
  size: number;
}

/**
 * Faylni (rasm bo'lsa WebP ga siqib) omborga yuklaydi va saqlangan kalitni qaytaradi
 */
export async function uploadFileToStorage(
  file: File,
  /** So'rovga qo'shiladigan maydonlar, masalan { homeworkLessonId } */
  extra: Record<string, string> = {}
): Promise<UploadedFile> {
  let body: Blob | File = file;
  let contentType = file.type || "application/octet-stream";
  let filename = file.name;

  if (file.type.startsWith("image/")) {
    body = await compressImageToWebP(file);
    contentType = "image/webp";
    filename = file.name.replace(/\.[^/.]+$/, "") + ".webp";
  }

  const presignedRes = await fetch("/api/upload/presigned-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, fileSize: body.size, ...extra }),
  });
  if (!presignedRes.ok) {
    const data = await presignedRes.json().catch(() => ({}));
    throw new Error(data.error || "Fayl yuklash uchun ruxsat olinmadi");
  }
  const { uploadUrl, key } = await presignedRes.json();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!uploadRes.ok) {
    throw new Error("Faylni saqlashda xatolik yuz berdi");
  }
  return { key, contentType, size: body.size };
}
