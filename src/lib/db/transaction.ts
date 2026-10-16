import type { ClientSession } from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";

/** Baza replica set emas (masalan, lokal yagona server): tranzaksiya qo'llanilmaydi */
function isTransactionUnsupported(error: unknown): boolean {
  const e = error as { code?: number; message?: string };
  return e?.code === 20 || /replica set|Transaction numbers are only allowed|does not support retryable writes/i.test(e?.message ?? "");
}

/**
 * Bir nechta yozuvni bitta tranzaksiyada bajaradi (Atlas — replica set). Tranzaksiya qo'llanilmaydigan bazada
 * xuddi shu amallar tranzaksiyasiz bajariladi: coin amallarining idempotentligi unique indekslarga ham tayanadi.
 * `fn` ichida tashqi ta'sir (bildirishnoma va h.k.) bo'lmasin — u qayta urinishda yana chaqirilishi mumkin.
 */
export async function withTransaction<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (error) {
    if (isTransactionUnsupported(error)) return fn(undefined);
    throw error;
  } finally {
    await session.endSession();
  }
}
