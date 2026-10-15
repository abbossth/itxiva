import mongoose from "mongoose";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger, type CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
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
