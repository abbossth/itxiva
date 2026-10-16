import { createHash } from "node:crypto";
import { connectToDatabase } from "@/lib/db/connect";
import { AiCache } from "@/lib/db/models/ai-cache.model";

// AI so'rovlarini tejash: natija kirish ma'lumotining xeshi bo'yicha saqlanadi (o'quvchi matni ochiq holda emas).

const RESULT_TTL_MS = 60 * 86_400_000;

export function aiCacheKey(kind: string, parts: unknown[]): string {
  return `${kind}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}

export async function readAiCache<T>(key: string): Promise<T | null> {
  try {
    await connectToDatabase();
    const row = await AiCache.findOne({ key, expiresAt: { $gt: new Date() } }).select("value").lean();
    return (row?.value as T | undefined) ?? null;
  } catch {
    // Kesh ishlamasa ham AI chaqirilaveradi
    return null;
  }
}

export async function writeAiCache(key: string, value: unknown, ttlMs = RESULT_TTL_MS): Promise<void> {
  try {
    await connectToDatabase();
    await AiCache.updateOne({ key }, { $set: { value, expiresAt: new Date(Date.now() + ttlMs) } }, { upsert: true });
  } catch (error) {
    console.error("AI cache write failed:", error instanceof Error ? error.message : error);
  }
}

/**
 * Natijani keshdan oladi, bo'lmasa `run` chaqiriladi va natija saqlanadi.
 * `fresh` — keshni o'qimasdan qayta so'raladi (mentor "Qaytadan tekshirish" bosganda); yangi natija saqlanadi.
 */
export async function cachedAi<T>(key: string, run: () => Promise<T>, { fresh = false }: { fresh?: boolean } = {}): Promise<T> {
  if (!fresh) {
    const hit = await readAiCache<T>(key);
    if (hit !== null) return hit;
  }
  const value = await run();
  await writeAiCache(key, value);
  return value;
}

// ---------- Modellarning kutish vaqti (barcha server nusxalari uchun umumiy) ----------

const cooldownKey = (model: string) => `cooldown:${model}`;

/** Kunlik limiti tugagan modellar va ular qachongacha chaqirilmasligi */
export async function readModelCooldowns(models: string[]): Promise<Map<string, number>> {
  try {
    await connectToDatabase();
    const rows = await AiCache.find({ key: { $in: models.map(cooldownKey) }, expiresAt: { $gt: new Date() } })
      .select("key expiresAt")
      .lean();
    return new Map(rows.map((r) => [r.key.slice("cooldown:".length), new Date(r.expiresAt).getTime()]));
  } catch {
    return new Map();
  }
}

export async function writeModelCooldown(model: string, until: number): Promise<void> {
  try {
    await connectToDatabase();
    await AiCache.updateOne(
      { key: cooldownKey(model) },
      { $set: { value: { until }, expiresAt: new Date(until) } },
      { upsert: true }
    );
  } catch {
    // Saqlanmasa, shu server nusxasining xotirasidagi belgi yetarli
  }
}
