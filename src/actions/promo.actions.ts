"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Promo, type IPromo } from "@/lib/db/models/promo.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireAuth, requireMentor, requireStudent } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { groupShortName } from "@/lib/group-name";
import { notify, notifyMentors } from "@/lib/notifications/notify";
import {
  PROMO_COLORS,
  PROMO_EMOJIS,
  PROMO_KINDS,
  PROMO_MAX_ACTIVE,
  PROMO_MAX_DAYS,
  PROMO_TEXT_MAX,
  PROMO_TITLE_MAX,
  cleanPromoLink,
  promoPrice,
  type PromoView,
} from "@/lib/promo";
import type { ActionResult } from "./auth.actions";

// Bosh sahifadagi pullik e'lonlar: o'quvchi buyurtma beradi (coin darhol yechiladi), ustoz tasdiqlaydi yoki rad etadi.

const DAY_MS = 86_400_000;
const oid = (id: string) => new mongoose.Types.ObjectId(id);

async function toViews(list: IPromo[]): Promise<PromoView[]> {
  const users = await User.find({ _id: { $in: list.map((p) => p.studentId) } }).select("fullName groupId").lean();
  const groupIds = users.map((u) => (u.groupId ? String(u.groupId) : null)).filter((g): g is string => Boolean(g));
  const groups = await Group.find({ _id: { $in: groupIds } }).select("name shortName grade").lean();
  const gname = new Map(groups.map((g) => [String(g._id), groupShortName(g)]));
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return list.map((p) => {
    const u = byId.get(String(p.studentId));
    return {
      id: String(p._id),
      kind: p.kind,
      title: p.title,
      text: p.text,
      link: p.link ?? null,
      emoji: p.emoji,
      color: p.color,
      author: u?.fullName ?? "O'quvchi",
      group: u?.groupId ? gname.get(String(u.groupId)) ?? null : null,
      days: p.days,
      price: p.price,
      status: p.status,
      startsAt: p.startsAt ? new Date(p.startsAt).toISOString() : null,
      endsAt: p.endsAt ? new Date(p.endsAt).toISOString() : null,
      note: p.note ?? null,
      createdAt: new Date(p.createdAt ?? Date.now()).toISOString(),
    };
  });
}

/** Hozir bosh sahifada ko'rinadiganlar (hamma uchun) */
export async function getActivePromos(): Promise<PromoView[]> {
  await requireAuth();
  await connectToDatabase();
  const now = new Date();
  const list = await Promo.find({ status: "approved", startsAt: { $lte: now }, endsAt: { $gt: now } }).sort({ startsAt: 1 }).limit(PROMO_MAX_ACTIVE).lean();
  return toViews(list);
}

/** O'quvchining o'z e'lonlari (oxirgi 10 ta) */
export async function getMyPromos(): Promise<PromoView[]> {
  const session = await requireStudent();
  await connectToDatabase();
  const list = await Promo.find({ studentId: session.userId }).sort({ createdAt: -1 }).limit(10).lean();
  return toViews(list);
}

/** Ustoz: tekshirish navbati va so'nggilar */
export async function getPromosForMentor(): Promise<{ pending: PromoView[]; recent: PromoView[] }> {
  await requireMentor();
  await connectToDatabase();
  const [pending, recent] = await Promise.all([
    Promo.find({ status: "pending" }).sort({ createdAt: 1 }).limit(50).lean(),
    Promo.find({ status: { $ne: "pending" } }).sort({ updatedAt: -1 }).limit(20).lean(),
  ]);
  return { pending: await toViews(pending), recent: await toViews(recent) };
}

export async function getPendingPromosCount(): Promise<number> {
  await requireMentor();
  await connectToDatabase();
  return Promo.countDocuments({ status: "pending" });
}

export interface PromoInput {
  kind: string;
  title: string;
  text: string;
  link?: string;
  emoji: string;
  color: string;
  days: number;
}

/** O'quvchi: e'lon buyurtma qilish — coin darhol yechiladi, ustoz tasdiqlashini kutadi */
export async function createPromoAction(input: PromoInput): Promise<ActionResult<{ balance: number }>> {
  const session = await requireStudent();
  const rate = checkRateLimit(`promo_${session.userId}`, 5, 10 * 60_000);
  if (!rate.allowed) return { success: false, message: "Juda tez — birozdan keyin urinib ko'ring" };
  const title = typeof input?.title === "string" ? input.title.replace(/\s+/g, " ").trim().slice(0, PROMO_TITLE_MAX) : "";
  const text = typeof input?.text === "string" ? input.text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, PROMO_TEXT_MAX) : "";
  const kind = PROMO_KINDS.find((k) => k.id === input?.kind)?.id;
  const emoji = PROMO_EMOJIS.includes(input?.emoji) ? input.emoji : "📣";
  const color = PROMO_COLORS.some((c) => c.id === input?.color) ? input.color : "teal";
  const days = Math.floor(Number(input?.days));
  const link = cleanPromoLink(input?.link);
  if (!kind) return { success: false, message: "Turini tanlang" };
  if (title.length < 3) return { success: false, message: "Sarlavha kamida 3 belgi bo'lsin" };
  if (!Number.isInteger(days) || days < 1 || days > PROMO_MAX_DAYS) return { success: false, message: `Muddat 1–${PROMO_MAX_DAYS} kun` };
  if (link === false) return { success: false, message: "Havola noto'g'ri (masalan: https://github.com/...)" };

  await connectToDatabase();
  // Bir vaqtda bittadan: kutilayotgan yoki hali tugamagan e'lon bo'lsa — yangisi yo'q
  const busy = await Promo.exists({ studentId: session.userId, $or: [{ status: "pending" }, { status: "approved", endsAt: { $gt: new Date() } }] });
  if (busy) return { success: false, message: "Sizda kutilayotgan yoki hali ko'rinib turgan e'lon bor" };

  const price = promoPrice(days);
  const user = await User.findOneAndUpdate(
    { _id: session.userId, role: "student", spendableBalance: { $gte: price } },
    { $inc: { spendableBalance: -price } },
    { returnDocument: "after" }
  );
  if (!user) return { success: false, message: `Balansingizda yetarli coin yo'q (${price} coin kerak)` };
  try {
    const promo = await Promo.create({ studentId: user._id, kind, title, text, link, emoji, color, days, price });
    await CoinLedger.create({
      studentId: user._id,
      amount: -price,
      type: "purchase",
      referenceId: promo._id,
      description: `Bosh sahifada e'lon (${days} kun): ${title}`,
      balanceAfter: user.spendableBalance,
    });
  } catch (err) {
    await User.updateOne({ _id: user._id }, { $inc: { spendableBalance: price } });
    throw err;
  }
  notifyMentors("order_new", { productTitle: `📣 Bosh sahifada e'lon: ${title}`, price, studentName: session.fullName });
  revalidatePath("/", "layout");
  return { success: true, message: "E'lon yuborildi! Ustoz tasdiqlagach bosh sahifada chiqadi.", data: { balance: user.spendableBalance ?? 0 } };
}

async function refund(p: IPromo, reason: string) {
  const user = await User.findByIdAndUpdate(p.studentId, { $inc: { spendableBalance: p.price } }, { returnDocument: "after" });
  await CoinLedger.create({
    studentId: p.studentId,
    amount: p.price,
    type: "adjustment",
    referenceId: p._id,
    description: `${reason}: bosh sahifadagi e'lon "${p.title}" (coin qaytarildi)`,
    balanceAfter: user?.spendableBalance,
  });
}

/** O'quvchi: tasdiqlanmagan e'lonni bekor qilish (coin qaytadi) */
export async function cancelPromoAction(id: string): Promise<ActionResult> {
  const session = await requireStudent();
  if (!mongoose.isValidObjectId(id)) return { success: false, message: "Topilmadi" };
  await connectToDatabase();
  const p = await Promo.findOneAndUpdate({ _id: oid(id), studentId: session.userId, status: "pending" }, { $set: { status: "cancelled" } }, { returnDocument: "after" }).lean();
  if (!p) return { success: false, message: "Bu e'lonni bekor qilib bo'lmaydi" };
  await refund(p, "Bekor qilindi");
  revalidatePath("/", "layout");
  return { success: true, message: `Bekor qilindi — ${p.price} coin qaytarildi` };
}

/** Ustoz: tasdiqlash — bo'sh joy bo'lsa darhol, aks holda navbat bilan chiqadi */
export async function approvePromoAction(id: string): Promise<ActionResult<{ startsAt: string }>> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(id)) return { success: false, message: "Topilmadi" };
  await connectToDatabase();
  const now = new Date();
  // Navbat: hozirdan keyin tugaydigan tasdiqlanganlar; joy bo'shaydigan eng erta vaqt
  const live = await Promo.find({ status: "approved", endsAt: { $gt: now } }).select("startsAt endsAt").sort({ endsAt: 1 }).lean();
  let start = now;
  if (live.length >= PROMO_MAX_ACTIVE) start = new Date(live[live.length - PROMO_MAX_ACTIVE].endsAt!);
  const p = await Promo.findOneAndUpdate(
    { _id: oid(id), status: "pending" },
    [{ $set: { status: "approved", reviewedBy: oid(session.userId), startsAt: start, endsAt: { $add: [start, { $multiply: ["$days", DAY_MS] }] } } }],
    { returnDocument: "after", updatePipeline: true }
  ).lean();
  if (!p) return { success: false, message: "Bu e'lon allaqachon ko'rib chiqilgan" };
  await AuditLog.create({ actorId: session.userId, action: "PROMO_APPROVE", details: { promoId: p._id, title: p.title } });
  notify(p.studentId, "order_status", { productTitle: `📣 E'loningiz: ${p.title}`, status: "accepted" });
  revalidatePath("/", "layout");
  return { success: true, message: start > now ? "Tasdiqlandi — navbatda, joy bo'shaganda chiqadi" : "Tasdiqlandi — bosh sahifada ko'rinyapti", data: { startsAt: start.toISOString() } };
}

/** Ustoz: rad etish (coin qaytadi) yoki ko'rinib turganini olib tashlash (qolgan kunlar uchun qaytadi) */
export async function rejectPromoAction(id: string, note?: string): Promise<ActionResult> {
  const session = await requireMentor();
  if (!mongoose.isValidObjectId(id)) return { success: false, message: "Topilmadi" };
  await connectToDatabase();
  const why = typeof note === "string" ? note.trim().slice(0, 300) : "";
  const before = await Promo.findOneAndUpdate(
    { _id: oid(id), status: { $in: ["pending", "approved"] } },
    { $set: { status: "rejected", note: why || null, reviewedBy: oid(session.userId) } },
    { returnDocument: "before" }
  ).lean();
  if (!before) return { success: false, message: "Bu e'lonni o'zgartirib bo'lmaydi" };
  const now = Date.now();
  let back = before.price;
  if (before.status === "approved" && before.startsAt && new Date(before.startsAt).getTime() <= now) {
    // Ko'rinib turgan edi: ishlatilmagan to'liq kunlar uchun qaytariladi
    const left = Math.max(0, Math.floor((new Date(before.endsAt!).getTime() - now) / DAY_MS));
    back = Math.round((before.price / before.days) * left);
  }
  if (back > 0) await refund({ ...before, price: back }, before.status === "pending" ? "Rad etildi" : "Olib tashlandi");
  await AuditLog.create({ actorId: session.userId, action: "PROMO_REJECT", details: { promoId: before._id, title: before.title, note: why, refunded: back } });
  notify(before.studentId, "order_status", { productTitle: `📣 E'loningiz: ${before.title}`, status: "rejected", note: why || undefined, refunded: back });
  revalidatePath("/", "layout");
  return { success: true, message: back > 0 ? `Rad etildi — ${back} coin qaytarildi` : "Olib tashlandi" };
}
