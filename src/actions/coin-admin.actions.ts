"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { awardCoins, syncLevel } from "@/lib/gamification/award";
import { notify } from "@/lib/notifications/notify";

// Mentor: o'quvchilarga qo'lda coin/XP berish va xato yozilgan coin/XP ni tuzatish.
// Yozuv hech qachon o'chirilmaydi — summasi o'zgartiriladi (bekor qilish = 0). Aks holda mukofot kaliti bo'shab,
// tizim xuddi shu mukofot yoki jarimani keyinroq qayta yozib yuborardi. Har amal audit jurnaliga yoziladi.

type Result<T = undefined> = { success: true; data: T; message?: string } | { success: false; message: string };
const fail = (message: string): { success: false; message: string } => ({ success: false, message });

const LIMIT = 5000;
const MAX_STUDENTS = 100;
/** Tuzatib bo'lmaydigan yozuvlar: xarid (buyurtmani rad etish orqali qaytariladi) va XP tenglashtirish */
const LOCKED_TYPES = new Set(["purchase", "xp_align"]);

const int = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const cleanReason = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 200) : "");

function errorOf(err: unknown, fallback: string) {
  unstable_rethrow(err);
  return fail(err instanceof Error ? err.message : fallback);
}

function revalidate(studentId: string, groupId?: string | null) {
  revalidatePath(`/mentor/students/${studentId}`);
  if (groupId) revalidatePath(`/mentor/groups/${groupId}`);
}

/**
 * Bitta yoki bir nechta o'quvchiga coin va/yoki XP berish (manfiy — olib qo'yish).
 * `requestId` — oynani ochganda yaratilgan kalit: tugma ikki marta bosilsa yoki so'rov qayta yuborilsa ikkinchi marta yozilmaydi.
 */
export async function grantCoinsAction(input: {
  studentIds: string[];
  coin: number;
  /** Berilmasa: musbat coin bilan teng, manfiyda 0 */
  xp?: number | null;
  reason: string;
  requestId: string;
}): Promise<Result<{ applied: number; appliedIds: string[]; skipped: string[] }>> {
  try {
    const mentor = await requireMentor();
    const ids = [...new Set(Array.isArray(input?.studentIds) ? input.studentIds : [])].filter((id) => typeof id === "string" && mongoose.isValidObjectId(id));
    if (ids.length === 0) return fail("O'quvchi tanlanmagan");
    if (ids.length > MAX_STUDENTS) return fail(`Bir vaqtda ko'pi bilan ${MAX_STUDENTS} ta o'quvchi`);
    const coin = int(input.coin);
    const xp = input.xp === null || input.xp === undefined || (input.xp as unknown) === "" ? Math.max(coin, 0) : int(input.xp);
    if (!Number.isFinite(coin) || !Number.isFinite(xp) || Math.abs(coin) > LIMIT || Math.abs(xp) > LIMIT) return fail(`Miqdor −${LIMIT}…${LIMIT} oralig'ida bo'lsin`);
    if (coin === 0 && xp === 0) return fail("Coin yoki XP miqdorini kiriting");
    const reason = cleanReason(input.reason);
    if (reason.length < 3) return fail("Sababini yozing (o'quvchi ham ko'radi)");
    const requestId = typeof input.requestId === "string" && /^[\w-]{8,64}$/.test(input.requestId) ? input.requestId : null;
    if (!requestId) return fail("So'rov kaliti noto'g'ri — oynani qayta oching");

    await connectToDatabase();
    const students = await User.find({ _id: { $in: ids }, role: "student" }).select("fullName groupId").lean();
    if (students.length === 0) return fail("O'quvchi topilmadi");

    let applied = 0;
    const appliedIds: string[] = [];
    const skipped: string[] = [];
    for (const s of students) {
      const res = await awardCoins({
        studentId: s._id,
        coin,
        xp,
        type: coin < 0 ? "adjustment" : "bonus",
        description: `Ustozdan: ${reason}`,
        idempotencyKey: `grant:${requestId}:${s._id}`,
        notifyReason: reason,
      });
      if (!res.ok) {
        skipped.push(s.fullName);
        continue;
      }
      if (res.applied) {
        applied++;
        appliedIds.push(String(s._id));
        await AuditLog.create({ actorId: mentor.userId, action: "GRANT_COINS", targetUserId: s._id, details: { coin, xp, reason } });
      }
    }
    for (const g of new Set(students.map((s) => s.groupId?.toString()).filter(Boolean))) revalidatePath(`/mentor/groups/${g}`);
    for (const s of students) revalidatePath(`/mentor/students/${s._id}`);
    const what = [coin ? `${coin > 0 ? "+" : ""}${coin} coin` : "", xp ? `${xp > 0 ? "+" : ""}${xp} XP` : ""].filter(Boolean).join(", ");
    return {
      success: true,
      data: { applied, appliedIds, skipped },
      message:
        skipped.length > 0
          ? `${applied} ta o'quvchiga ${what}. Balans yetmagani uchun o'tkazib yuborildi: ${skipped.join(", ")}`
          : students.length === 1
          ? `${students[0].fullName}: ${what}`
          : `${applied} ta o'quvchiga ${what}`,
    };
  } catch (err) {
    return errorOf(err, "Coin berib bo'lmadi");
  }
}

/**
 * Coin yozuvining summasini o'zgartirish (0 va 0 — bekor qilish). Balans va XP farq bo'yicha to'g'rilanadi.
 * Balans manfiyga tushmaydi: o'quvchi coinlarni sarflab bo'lgan bo'lsa — rad etiladi (kamroq miqdor kiritish mumkin).
 * XP noldan pastga tushmaydi; daraja pasaytirilmaydi (tizim qoidasi).
 */
export async function editCoinEntryAction(input: { entryId: string; coin: number; xp: number; reason: string }): Promise<Result<{ balance: number }>> {
  try {
    const mentor = await requireMentor();
    if (typeof input?.entryId !== "string" || !mongoose.isValidObjectId(input.entryId)) return fail("Yozuv topilmadi");
    const coin = int(input.coin);
    const xp = int(input.xp);
    if (!Number.isFinite(coin) || !Number.isFinite(xp) || Math.abs(coin) > LIMIT || xp < 0 || xp > LIMIT) return fail(`Coin −${LIMIT}…${LIMIT}, XP 0…${LIMIT} oralig'ida bo'lsin`);
    const reason = cleanReason(input.reason);
    if (reason.length < 3) return fail("Sababini yozing");

    await connectToDatabase();
    const entry = await CoinLedger.findById(input.entryId).select("studentId amount xp type").lean();
    if (!entry) return fail("Yozuv topilmadi");
    if (LOCKED_TYPES.has(entry.type)) return fail(entry.type === "purchase" ? "Xaridni bu yerda o'zgartirib bo'lmaydi — buyurtmani rad eting, coin o'zi qaytadi" : "Bu yozuvni o'zgartirib bo'lmaydi");
    const fromCoin = entry.amount ?? 0;
    const fromXp = entry.xp ?? 0;
    const dCoin = coin - fromCoin;
    const dXp = xp - fromXp;
    if (dCoin === 0 && dXp === 0) return fail("O'zgarish yo'q");
    const voiding = coin === 0 && xp === 0;

    // 1. Yozuv: faqat hozirgi qiymati o'zgarmagan bo'lsa (ikki mentor bir vaqtda tuzatsa — ikkinchisi rad etiladi)
    const edit = { at: new Date(), by: new mongoose.Types.ObjectId(mentor.userId), fromCoin, fromXp, toCoin: coin, toXp: xp, reason };
    const moved = await CoinLedger.updateOne(
      { _id: entry._id, amount: fromCoin, ...(entry.xp === undefined ? { xp: { $exists: false } } : { xp: fromXp }) },
      { $set: { amount: coin, xp, voidedAt: voiding ? new Date() : null }, $push: { edits: edit } }
    );
    if (moved.modifiedCount === 0) return fail("Yozuv hozirgina o'zgardi — sahifani yangilang");

    // 2. O'quvchi hisobi: balans manfiyga tushmasin
    const updated = await User.findOneAndUpdate(
      { _id: entry.studentId, role: "student", ...(dCoin < 0 ? { spendableBalance: { $gte: -dCoin } } : {}) },
      [
        {
          $set: {
            spendableBalance: { $add: [{ $ifNull: ["$spendableBalance", 0] }, dCoin] },
            totalCoins: { $add: [{ $ifNull: ["$totalCoins", 0] }, dCoin] },
            xp: { $max: [0, { $add: [{ $ifNull: ["$xp", 0] }, dXp] }] },
          },
        },
      ],
      { returnDocument: "after", updatePipeline: true }
    )
      .select("spendableBalance groupId")
      .lean();
    if (!updated) {
      // Orqaga qaytariladi: yozuv avvalgi holatiga
      await CoinLedger.updateOne(
        { _id: entry._id },
        { $set: { amount: fromCoin, voidedAt: null, ...(entry.xp === undefined ? {} : { xp: fromXp }) }, ...(entry.xp === undefined ? { $unset: { xp: "" } } : {}), $pop: { edits: 1 } }
      );
      const u = await User.findById(entry.studentId).select("spendableBalance").lean();
      return fail(`Balans yetmaydi: o'quvchida ${u?.spendableBalance ?? 0} coin bor, ${-dCoin} coin olib bo'lmaydi. Kamroq miqdor kiriting`);
    }

    await AuditLog.create({
      actorId: mentor.userId,
      action: voiding ? "VOID_COIN_ENTRY" : "EDIT_COIN_ENTRY",
      targetUserId: entry.studentId,
      details: { entryId: String(entry._id), type: entry.type, fromCoin, fromXp, toCoin: coin, toXp: xp, reason },
    });
    if (dXp > 0) await syncLevel(entry.studentId);
    if (dCoin !== 0) notify(entry.studentId, "coins_changed", { amount: dCoin, reason: `Ustoz tuzatdi: ${reason}`, balance: updated.spendableBalance ?? 0 });
    revalidate(String(entry.studentId), updated.groupId?.toString());
    return {
      success: true,
      data: { balance: updated.spendableBalance ?? 0 },
      message: voiding ? "Yozuv bekor qilindi" : `Saqlandi: ${dCoin ? `${dCoin > 0 ? "+" : ""}${dCoin} coin` : ""}${dCoin && dXp ? ", " : ""}${dXp ? `${dXp > 0 ? "+" : ""}${dXp} XP` : ""}`,
    };
  } catch (err) {
    return errorOf(err, "Yozuvni o'zgartirib bo'lmadi");
  }
}
