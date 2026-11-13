"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger, type CoinTransactionType } from "@/lib/db/models/coin-ledger.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { awardCoins, syncLevel } from "@/lib/gamification/award";
import { notify } from "@/lib/notifications/notify";
import { dayKey } from "@/lib/gamification/periods";

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
type Change =
  | { ok: true; balance: number; groupId: string | null; dCoin: number; dXp: number; voiding: boolean; studentId: string }
  | { ok: false; message: string };

/** Bitta yozuvni o'zgartirish (yoki 0/0 — bekor qilish): yozuv, o'quvchi hisobi, audit va xabar */
async function changeEntry(mentorId: string, entryId: string, coin: number, xp: number, reason: string): Promise<Change> {
  const entry = await CoinLedger.findById(entryId).select("studentId amount xp type").lean();
  if (!entry) return { ok: false, message: "Yozuv topilmadi" };
  if (LOCKED_TYPES.has(entry.type)) {
    return { ok: false, message: entry.type === "purchase" ? "Xaridni bu yerda o'zgartirib bo'lmaydi — buyurtmani rad eting, coin o'zi qaytadi" : "Bu yozuvni o'zgartirib bo'lmaydi" };
  }
  const fromCoin = entry.amount ?? 0;
  const fromXp = entry.xp ?? 0;
  const dCoin = coin - fromCoin;
  const dXp = xp - fromXp;
  if (dCoin === 0 && dXp === 0) return { ok: false, message: "O'zgarish yo'q" };
  const voiding = coin === 0 && xp === 0;

  // 1. Yozuv: faqat hozirgi qiymati o'zgarmagan bo'lsa (ikki mentor bir vaqtda tuzatsa — ikkinchisi rad etiladi)
  const edit = { at: new Date(), by: new mongoose.Types.ObjectId(mentorId), fromCoin, fromXp, toCoin: coin, toXp: xp, reason };
  const moved = await CoinLedger.updateOne(
    { _id: entry._id, amount: fromCoin, ...(entry.xp === undefined ? { xp: { $exists: false } } : { xp: fromXp }) },
    { $set: { amount: coin, xp, voidedAt: voiding ? new Date() : null }, $push: { edits: edit } }
  );
  if (moved.modifiedCount === 0) return { ok: false, message: "Yozuv hozirgina o'zgardi — sahifani yangilang" };

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
    return { ok: false, message: `Balans yetmaydi: o'quvchida ${u?.spendableBalance ?? 0} coin bor, ${-dCoin} coin olib bo'lmaydi. Kamroq miqdor kiriting` };
  }

  await AuditLog.create({
    actorId: mentorId,
    action: voiding ? "VOID_COIN_ENTRY" : "EDIT_COIN_ENTRY",
    targetUserId: entry.studentId,
    details: { entryId: String(entry._id), type: entry.type, fromCoin, fromXp, toCoin: coin, toXp: xp, reason },
  });
  if (dXp > 0) await syncLevel(entry.studentId);
  if (dCoin !== 0) notify(entry.studentId, "coins_changed", { amount: dCoin, reason: `Ustoz tuzatdi: ${reason}`, balance: updated.spendableBalance ?? 0 });
  return { ok: true, balance: updated.spendableBalance ?? 0, groupId: updated.groupId?.toString() ?? null, dCoin, dXp, voiding, studentId: String(entry.studentId) };
}

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
    const r = await changeEntry(mentor.userId, input.entryId, coin, xp, reason);
    if (!r.ok) return fail(r.message);
    revalidate(r.studentId, r.groupId);
    const { dCoin, dXp } = r;
    return {
      success: true,
      data: { balance: r.balance },
      message: r.voiding ? "Yozuv bekor qilindi" : `Saqlandi: ${dCoin ? `${dCoin > 0 ? "+" : ""}${dCoin} coin` : ""}${dCoin && dXp ? ", " : ""}${dXp ? `${dXp > 0 ? "+" : ""}${dXp} XP` : ""}`,
    };
  } catch (err) {
    return errorOf(err, "Yozuvni o'zgartirib bo'lmadi");
  }
}

// ---- Guruh bo'yicha: bir xil xato bilan yozilgan coinlarni birdaniga bekor qilish ----

export interface CoinBatch {
  /** type + sabab + kun (Toshkent) */
  key: string;
  type: string;
  description: string;
  day: string;
  /** Bitta o'quvchiga (ko'pchilikda bir xil) */
  amount: number;
  total: number;
  entries: { id: string; studentId: string; name: string; amount: number; xp: number; at: string }[];
}

const BATCH_DAYS = 60;

/**
 * Guruh o'quvchilarining oxirgi 60 kundagi coin yozuvlari, bir xil sabab va kun bo'yicha to'plangan:
 * masalan, butun guruhga bir kunda yozilgan "Darsga kelmagani uchun" jarimasi — bitta to'plam.
 */
export async function getGroupCoinBatchesAction(groupId: string, sign: "minus" | "plus" = "minus"): Promise<Result<{ batches: CoinBatch[] }>> {
  try {
    await requireMentor();
    if (typeof groupId !== "string" || !mongoose.isValidObjectId(groupId)) return fail("Guruh topilmadi");
    await connectToDatabase();
    const students = await User.find({ groupId, role: "student" }).select("fullName").lean();
    if (students.length === 0) return { success: true, data: { batches: [] } };
    const nameOf = new Map(students.map((s) => [String(s._id), s.fullName]));
    const rows = await CoinLedger.find({
      studentId: { $in: students.map((s) => s._id) },
      createdAt: { $gte: new Date(Date.now() - BATCH_DAYS * 86_400_000) },
      type: { $nin: ["purchase", "xp_align"] as CoinTransactionType[] },
      // null — maydon yo'q yoki bo'sh (bekor qilinmagan)
      voidedAt: null,
      amount: sign === "minus" ? { $lt: 0 } : { $gt: 0 },
    })
      .select("studentId amount xp type description createdAt")
      .sort({ createdAt: -1 })
      .limit(3000)
      .lean();
    const by = new Map<string, CoinBatch>();
    for (const r of rows) {
      const day = dayKey(r.createdAt ?? new Date());
      const key = `${r.type}|${r.description}|${day}`;
      const b = by.get(key) ?? { key, type: r.type, description: r.description, day, amount: 0, total: 0, entries: [] };
      b.entries.push({ id: String(r._id), studentId: String(r.studentId), name: nameOf.get(String(r.studentId)) ?? "?", amount: r.amount, xp: r.xp ?? 0, at: new Date(r.createdAt ?? 0).toISOString() });
      b.total += r.amount;
      by.set(key, b);
    }
    const batches = [...by.values()]
      .map((b) => {
        // Eng ko'p uchraydigan summa
        const freq = new Map<number, number>();
        for (const e of b.entries) freq.set(e.amount, (freq.get(e.amount) ?? 0) + 1);
        const amount = [...freq.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;
        return { ...b, amount, entries: b.entries.sort((x, y) => x.name.localeCompare(y.name)) };
      })
      // Avval ko'p o'quvchiga tegishli, keyin yangilari
      .sort((a, b) => b.entries.length - a.entries.length || b.day.localeCompare(a.day))
      .slice(0, 40);
    return { success: true, data: { batches } };
  } catch (err) {
    return errorOf(err, "Yozuvlarni olib bo'lmadi");
  }
}

/** Tanlangan yozuvlarni bekor qilish (har biri alohida: balansi yetmagan o'quvchi o'tkazib yuboriladi) */
export async function voidCoinEntriesAction(input: { entryIds: string[]; reason: string }): Promise<Result<{ voided: number; voidedIds: string[]; skipped: string[]; byStudent: Record<string, number> }>> {
  try {
    const mentor = await requireMentor();
    const ids = [...new Set(Array.isArray(input?.entryIds) ? input.entryIds : [])].filter((id) => typeof id === "string" && mongoose.isValidObjectId(id));
    if (ids.length === 0) return fail("Yozuv tanlanmagan");
    if (ids.length > 200) return fail("Bir vaqtda ko'pi bilan 200 ta yozuv");
    const reason = cleanReason(input.reason);
    if (reason.length < 3) return fail("Sababini yozing (o'quvchilar ham ko'radi)");

    await connectToDatabase();
    const entries = await CoinLedger.find({ _id: { $in: ids } }).select("studentId").lean();
    const names = new Map(
      (await User.find({ _id: { $in: entries.map((e) => e.studentId) } }).select("fullName").lean()).map((u) => [String(u._id), u.fullName])
    );
    let voided = 0;
    const voidedIds: string[] = [];
    const skipped: string[] = [];
    const byStudent: Record<string, number> = {};
    const groups = new Set<string>();
    for (const e of entries) {
      const r = await changeEntry(mentor.userId, String(e._id), 0, 0, reason);
      if (!r.ok) {
        if (r.message !== "O'zgarish yo'q") skipped.push(names.get(String(e.studentId)) ?? "?");
        continue;
      }
      voided++;
      voidedIds.push(String(e._id));
      byStudent[r.studentId] = (byStudent[r.studentId] ?? 0) + r.dCoin;
      if (r.groupId) groups.add(r.groupId);
      revalidatePath(`/mentor/students/${r.studentId}`);
    }
    for (const g of groups) revalidatePath(`/mentor/groups/${g}`);
    return {
      success: true,
      data: { voided, voidedIds, skipped, byStudent },
      message:
        skipped.length > 0
          ? `${voided} ta yozuv bekor qilindi. Bekor qilib bo'lmadi (balans yetmaydi yoki o'zgargan): ${skipped.join(", ")}`
          : `${voided} ta yozuv bekor qilindi`,
    };
  } catch (err) {
    return errorOf(err, "Bekor qilib bo'lmadi");
  }
}
