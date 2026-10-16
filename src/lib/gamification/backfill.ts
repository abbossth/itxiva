import mongoose from "mongoose";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger, type CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
import { withTransaction } from "@/lib/db/transaction";
import { buildLevels, levelForXp } from "./levels";

// Mavjud o'quvchilarning XP sini coin tarixidan hisoblaydi.
// Idempotent: XP har safar ledger'dan to'liq qayta hisoblanadi, shuning uchun skriptni necha marta ishga
// tushirish ham natijani o'zgartirmaydi.
//  - Gamifikatsiyadan oldingi yozuvlar (`xp` maydoni yo'q): daromad turlari bo'yicha `amount`. Davomat jarimalari
//    "adjustment" turida yozilgan — ular XP ni kamaytirmaydi; vazifani qayta baholashdagi kamayish ("homework") kamaytiradi.
//  - Yangi yozuvlar: o'zining `xp` qiymati.
// Daraja XP ga qarab qo'yiladi (pasaytirilmaydi). Backfill daraja bonusini bermaydi va tabrik oynasini ko'rsatmaydi.

export const LEGACY_EARNING_TYPES: CoinTransactionType[] = ["attendance", "homework", "quiz", "exam", "bonus"];

export interface BackfillChange {
  studentId: string;
  fullName: string;
  xpFrom: number;
  xpTo: number;
  levelFrom: number;
  levelTo: number;
}

export interface BackfillResult {
  students: number;
  changes: BackfillChange[];
  applied: boolean;
}

export async function backfillXp({
  dryRun,
  levelThresholds,
}: {
  dryRun: boolean;
  levelThresholds?: number[];
}): Promise<BackfillResult> {
  const levels = buildLevels(levelThresholds);
  const students = await User.find({ role: "student" }).select("fullName xp level").lean();

  const sums = await CoinLedger.aggregate<{ _id: mongoose.Types.ObjectId; xp: number }>([
    { $match: { studentId: { $in: students.map((s) => s._id) } } },
    {
      $group: {
        _id: "$studentId",
        xp: {
          $sum: {
            $cond: [
              { $eq: [{ $type: "$xp" }, "missing"] },
              { $cond: [{ $in: ["$type", LEGACY_EARNING_TYPES] }, "$amount", 0] },
              "$xp",
            ],
          },
        },
      },
    },
  ]);
  const xpById = new Map(sums.map((r) => [String(r._id), Math.max(0, Math.round(r.xp))]));

  const changes: BackfillChange[] = [];
  for (const s of students) {
    const xpTo = xpById.get(String(s._id)) ?? 0;
    const levelFrom = s.level ?? 1;
    const levelTo = Math.max(levelFrom, levelForXp(xpTo, levels).level);
    const xpFrom = s.xp ?? 0;
    if (xpTo !== xpFrom || levelTo !== levelFrom) {
      changes.push({ studentId: String(s._id), fullName: s.fullName, xpFrom, xpTo, levelFrom, levelTo });
    }
  }

  if (!dryRun && changes.length > 0) {
    await User.bulkWrite(
      changes.map((c) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(c.studentId) },
          update: { $set: { xp: c.xpTo, level: c.levelTo } },
        },
      }))
    );
  }
  return { students: students.length, changes, applied: !dryRun };
}

const alignKey = (studentId: unknown) => `xp-align:${String(studentId)}`;

/**
 * XP ni gamifikatsiyadan oldingi reyting ko'rsatkichiga (`totalCoins`) tenglashtiradi — o'quvchilar reytingdagi
 * o'rnini saqlaydi. Har o'quvchiga bir marta: "xp_align" yozuvi (coin 0, xp = farq) unique `idempotencyKey` bilan,
 * shuning uchun qayta ishga tushirish hech narsani o'zgartirmaydi va ledger bo'yicha qayta hisob (backfillXp) ham
 * shu natijani beradi. Daraja XP ga qarab qo'yiladi (pasaytirilmaydi), bonus va tabrik oynasi berilmaydi.
 */
export async function alignXpToCoins({
  dryRun,
  levelThresholds,
}: {
  dryRun: boolean;
  levelThresholds?: number[];
}): Promise<BackfillResult> {
  const levels = buildLevels(levelThresholds);
  const students = await User.find({ role: "student" }).select("fullName xp level totalCoins").lean();
  const aligned = await CoinLedger.find({ idempotencyKey: { $in: students.map((s) => alignKey(s._id)) } })
    .select("studentId")
    .lean();
  const done = new Set(aligned.map((l) => String(l.studentId)));

  const changes: BackfillChange[] = [];
  const coinsById = new Map<string, number>();
  for (const s of students) {
    if (done.has(String(s._id))) continue;
    const xpFrom = s.xp ?? 0;
    const xpTo = Math.max(0, Math.round(s.totalCoins ?? 0));
    const levelFrom = s.level ?? 1;
    const levelTo = Math.max(levelFrom, levelForXp(xpTo, levels).level);
    if (xpTo !== xpFrom || levelTo !== levelFrom) {
      changes.push({ studentId: String(s._id), fullName: s.fullName, xpFrom, xpTo, levelFrom, levelTo });
      coinsById.set(String(s._id), s.totalCoins ?? 0);
    }
  }

  if (!dryRun) {
    for (const c of changes) {
      try {
        await withTransaction(async (session) => {
          await CoinLedger.create(
            [
              {
                studentId: c.studentId,
                amount: 0,
                xp: c.xpTo - c.xpFrom,
                type: "xp_align",
                idempotencyKey: alignKey(c.studentId),
                description: `XP oldingi reytingga tenglashtirildi: ${c.xpFrom} → ${c.xpTo}`,
                balanceAfter: coinsById.get(c.studentId),
              },
            ],
            { session }
          );
          // $inc: o'qish va yozish orasida berilgan XP yo'qolmaydi
          await User.updateOne(
            { _id: c.studentId },
            { $inc: { xp: c.xpTo - c.xpFrom }, $max: { level: c.levelTo } },
            { session }
          );
        });
      } catch (error) {
        // Parallel ishga tushirilgan boshqa nusxa allaqachon tenglashtirgan
        if ((error as { code?: number })?.code === 11000) continue;
        throw error;
      }
    }
  }
  return { students: students.length, changes, applied: !dryRun };
}
