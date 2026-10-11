import { connectToDatabase } from "@/lib/db/connect";
import { RateLimit } from "@/lib/db/models/rate-limit.model";

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Urinishni hisoblaydi va limitdan oshgan-oshmaganini qaytaradi. Hisob bazada turadi, shuning uchun
 * barcha server nusxalari uchun umumiy. Sanash va tekshirish bitta atomik so'rovda bajariladi.
 */
export async function consumeRateLimit(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitStatus> {
  await connectToDatabase();
  const now = new Date();
  const inWindow = { $gt: ["$resetAt", now] };

  const hit = () =>
    RateLimit.findOneAndUpdate(
      { key },
      [
        {
          $set: {
            count: { $cond: [inWindow, { $add: ["$count", 1] }, 1] },
            resetAt: { $cond: [inWindow, "$resetAt", new Date(now.getTime() + windowMs)] },
          },
        },
      ],
      { upsert: true, returnDocument: "after", updatePipeline: true }
    ).lean();

  let record;
  try {
    record = await hit();
  } catch (err) {
    // Bir vaqtda kelgan ikki so'rov yozuvni birga yaratmoqchi bo'lsa, biri unikal indeksga uriladi
    if ((err as { code?: number }).code !== 11000) throw err;
    record = await hit();
  }

  const count = record?.count ?? 1;
  const resetAt = record?.resetAt ? new Date(record.resetAt).getTime() : now.getTime() + windowMs;
  return {
    allowed: count <= maxAttempts,
    remaining: Math.max(0, maxAttempts - count),
    resetInSeconds: Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

export async function clearRateLimit(key: string): Promise<void> {
  await connectToDatabase();
  await RateLimit.deleteOne({ key });
}

/** Kutish vaqtini odam o'qiydigan ko'rinishda: "45 soniya", "12 daqiqa" */
export function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds} soniya` : `${Math.ceil(seconds / 60)} daqiqa`;
}
