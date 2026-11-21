import mongoose from "mongoose";
import { AppSettings } from "@/lib/db/models/app-settings.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { Penalty } from "@/lib/db/models/penalty.model";
import { AttendanceRecord } from "@/lib/db/models/attendance-record.model";
import { User } from "@/lib/db/models/user.model";
import { syncLevel } from "@/lib/gamification/award";

// Bir martalik tuzatishlar (5 daqiqalik cron chaqiradi; bajarilgach `appliedFixes` ga yoziladi va qayta ishlamaydi):
// 1) Jarima endi XP olmaydi — avval jarimalar bilan olingan XP o'quvchilarga qaytariladi.
// 2) Mentor coin yozuvini qaytargan jarimalar oy ichidagi jarima sanog'idan chiqariladi.

const XP_FIX = "2026-11-21-penalty-xp-restore";
const VOID_FIX = "2026-11-21-penalty-void-sync";

async function applied(): Promise<string[]> {
  return (await AppSettings.findOne({ key: "global" }).select("appliedFixes").lean())?.appliedFixes ?? [];
}
const markDone = (id: string) => AppSettings.updateOne({ key: "global" }, { $addToSet: { appliedFixes: id } }, { upsert: true });

export async function applyGamificationFixes(): Promise<{ xpRestored: number; penaltiesVoided: number } | null> {
  const done = await applied();
  if (done.includes(XP_FIX) && done.includes(VOID_FIX)) return null;
  let xpRestored = 0;
  let penaltiesVoided = 0;

  if (!done.includes(XP_FIX)) {
    // Jarima yozuvlaridagi manfiy XP (bekor qilinmaganlari) — o'quvchi bo'yicha jami
    const rows = await CoinLedger.aggregate<{ _id: mongoose.Types.ObjectId; xp: number }>([
      { $match: { type: "penalty", xp: { $lt: 0 }, voidedAt: null } },
      { $group: { _id: "$studentId", xp: { $sum: "$xp" } } },
    ]);
    for (const r of rows) {
      const back = -r.xp;
      if (back <= 0) continue;
      const res = await User.updateOne({ _id: r._id, role: "student" }, { $inc: { xp: back } });
      if (res.modifiedCount === 0) continue;
      await CoinLedger.create({
        studentId: r._id,
        amount: 0,
        xp: back,
        type: "adjustment",
        description: "Jarimada olingan XP qaytarildi (endi jarima faqat coin oladi)",
        idempotencyKey: `${XP_FIX}:${r._id}`,
      });
      await syncLevel(r._id);
      xpRestored++;
    }
    // Davomat yozuvlari: jarima XP ga tegmaydi — keyingi qayta hisoblashda XP ikki marta qaytmasin
    await AttendanceRecord.updateMany({ xpDelta: { $lt: 0 } }, { $set: { xpDelta: 0 } });
    await markDone(XP_FIX);
  }

  if (!done.includes(VOID_FIX)) {
    const reversed = await CoinLedger.find({ type: "penalty", referenceId: { $ne: null }, $or: [{ voidedAt: { $ne: null } }, { amount: { $gte: 0 } }] })
      .select("studentId referenceId")
      .lean();
    for (const e of reversed) {
      const res = await Penalty.updateOne({ studentId: e.studentId, refId: e.referenceId, voidedAt: null }, { $set: { voidedAt: new Date() } });
      penaltiesVoided += res.modifiedCount;
    }
    await markDone(VOID_FIX);
  }
  return { xpRestored, penaltiesVoided };
}
