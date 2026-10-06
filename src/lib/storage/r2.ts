import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "5f9109839719d5cf37ba7f8c35a7f19c";
const R2_BUCKET = process.env.R2_BUCKET_NAME || "itxivas3";

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";

    s3ClientInstance = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/zip",
  "application/x-zip-compressed",
];

export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Generate a presigned PUT URL for uploading a file to R2 directly from browser
 */
export async function getUploadPresignedUrl({
  key,
  contentType,
  skipTypeCheck = false,
}: {
  key: string;
  contentType: string;
  skipTypeCheck?: boolean;
}): Promise<{ uploadUrl: string; key: string }> {
  if (!skipTypeCheck && !ALLOWED_FILE_TYPES.includes(contentType)) {
    throw new Error(`Ruxsat berilmagan fayl turi: ${contentType}`);
  }

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  // Presigned URL valid for 15 minutes (900 seconds)
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
  return { uploadUrl, key };
}

/**
 * Generate a presigned GET URL for securely downloading/viewing a file from private R2 bucket
 */
export async function getDownloadPresignedUrl({
  key,
  expiresInSeconds = 3600, // 1 hour
}: {
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    // Fayl nomi noyob va o'zgarmas — havola amal qilguncha brauzer qayta yuklamaydi (boshqalar keshlamaydi)
    ResponseCacheControl: `private, max-age=${expiresInSeconds}, immutable`,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Serverda yaratilgan faylni (masalan, AI tuzgan taqdimot) to'g'ridan-to'g'ri omborga yozadi
 */
export async function uploadBuffer({
  key,
  body,
  contentType,
}: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Fayl ombori (R2) sozlanmagan");
  }
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "private, max-age=31536000, immutable",
    })
  );
}
