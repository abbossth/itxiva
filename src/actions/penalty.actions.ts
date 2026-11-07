"use server";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { Penalty, type PenaltyKind } from "@/lib/db/models/penalty.model";
import { getCurrentUser } from "@/lib/auth/guards";
import { monthKeyOf, penaltyAmount } from "@/lib/penalty-ladder";

// Jarima oynasi: o'quvchi saytga kirganda hali ko'rmagan jarimalari (sababsiz qoldirish, topshirilmagan vazifa)
// balansdan qancha olingani va sababi bilan bir marta ko'rsatiladi.

/** Shundan eski ko'rilmagan jarimalar ko'rsatilmaydi */
const SHOW_DAYS = 30;

export interface PenaltyNoticeItem {
  id: string;
  kind: PenaltyKind;
  reason: string;
  /** Zinapoya bo'yicha summa */
  wanted: number;
  /** Haqiqatda olingan (balans yetmasa kamroq) */
  applied: number;
  no: number;
}

export interface PenaltyNotice {
  items: PenaltyNoticeItem[];
  /** Jami haqiqatda olingan coin */
  total: number;
  /** Hozirgi balans */
  balance: number;
  /** Joriy oyda yana takrorlansa olinadigan coin: tur bo'yicha */
  next: Partial<Record<PenaltyKind, number>>;
  effects: boolean;
}

export async function getUnseenPenaltiesAction(): Promise<PenaltyNotice | null> {
  const session = await getCurrentUser();
  if (session?.role !== "student") return null;
  await connectToDatabase();

  const studentId = new mongoose.Types.ObjectId(session.userId);
  const rows = await Penalty.find({
    studentId,
    seenAt: null,
    createdAt: { $gt: new Date(Date.now() - SHOW_DAYS * 24 * 60 * 60 * 1000) },
  })
    .select("kind reason wanted applied no")
    .sort({ createdAt: 1 })
    .limit(20)
    .lean();
  if (rows.length === 0) return null;

  const monthKey = monthKeyOf(new Date());
  const kinds = [...new Set(rows.map((r) => r.kind))];
  const [user, ...counts] = await Promise.all([
    User.findById(studentId).select("spendableBalance celebrationsEnabled").lean(),
    ...kinds.map((kind) => Penalty.countDocuments({ studentId, kind, monthKey })),
  ]);

  return {
    items: rows.map((r) => ({
      id: r._id.toString(),
      kind: r.kind,
      reason: r.reason,
      wanted: r.wanted,
      applied: r.applied ?? 0,
      no: r.no,
    })),
    total: rows.reduce((sum, r) => sum + (r.applied ?? 0), 0),
    balance: user?.spendableBalance ?? 0,
    next: Object.fromEntries(kinds.map((kind, i) => [kind, penaltyAmount((counts[i] as number) + 1)])),
    effects: user?.celebrationsEnabled !== false,
  };
}

/** Jarima oynasi yopildi: ko'rsatilgan jarimalar qayta chiqmaydi */
export async function acknowledgePenaltiesAction(ids: unknown): Promise<void> {
  const session = await getCurrentUser();
  if (session?.role !== "student" || !Array.isArray(ids)) return;
  const valid = ids.filter((id): id is string => typeof id === "string" && mongoose.isValidObjectId(id)).slice(0, 50);
  if (valid.length === 0) return;
  await connectToDatabase();
  await Penalty.updateMany({ _id: { $in: valid }, studentId: session.userId, seenAt: null }, { $set: { seenAt: new Date() } });
}
