import { CheatEvent } from "@/lib/db/models/cheat-event.model";
import { CHEAT_KINDS, type CheatContext, type CheatCounts } from "./kinds";

/** Qoidabuzarliklarni qo'shib yozadi (server ichidan ham chaqiriladi — masalan juda tez javob) */
export async function recordCheats(studentId: string, context: CheatContext, refId: string, counts: CheatCounts): Promise<void> {
  const inc: Record<string, number> = {};
  let total = 0;
  for (const k of CHEAT_KINDS) {
    const n = Math.max(0, Math.min(50, Math.floor(counts[k] ?? 0)));
    if (n > 0) {
      inc[`counts.${k}`] = n;
      total += n;
    }
  }
  if (total === 0) return;
  await CheatEvent.updateOne(
    { studentId, context, refId },
    { $inc: { ...inc, total }, $set: { lastAt: new Date() } },
    { upsert: true }
  );
}

/** Mentor uchun: bitta test/imtihon/o'yin bo'yicha o'quvchilar sanoqlari (studentId → counts) */
export async function cheatsFor(context: CheatContext, refId: string): Promise<Map<string, CheatCounts>> {
  const rows = await CheatEvent.find({ context, refId, total: { $gt: 0 } }).select("studentId counts").lean();
  return new Map(rows.map((r) => [String(r.studentId), (r.counts ?? {}) as CheatCounts]));
}
