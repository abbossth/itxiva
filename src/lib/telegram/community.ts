import mongoose from "mongoose";
import { User } from "@/lib/db/models/user.model";

// "Nechta o'quvchi Telegram'ni ulagan" — ulash tugmasi yonida ko'rsatiladi. Boshqa o'quvchilarning faqat
// bosh harflari chiqadi (ism, login, Telegram username serverdan tashqariga chiqmaydi).

export interface TelegramCommunity {
  /** Ulagan faol o'quvchilar (guruhga biriktirilgan) */
  linked: number;
  /** Jami faol o'quvchilar */
  total: number;
  /** Ko'rayotgan o'quvchining guruhi: ulaganlar / jami */
  group: { linked: number; total: number } | null;
  /** Oxirgi ulaganlarning bosh harflari (reytingdan yashirilganlar chiqmaydi) */
  recent: string[];
}

const RECENT_LIMIT = 4;
const LINKED = { "telegram.chatId": { $type: "string" as const } };

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toLocaleUpperCase("uz");
}

export async function telegramCommunity(groupId?: string | mongoose.Types.ObjectId | null): Promise<TelegramCommunity> {
  const active = { role: "student" as const, groupId: { $ne: null } };
  const [linked, total, groupLinked, groupTotal, recent] = await Promise.all([
    User.countDocuments({ ...active, ...LINKED }),
    User.countDocuments(active),
    groupId ? User.countDocuments({ role: "student", groupId, ...LINKED }) : 0,
    groupId ? User.countDocuments({ role: "student", groupId }) : 0,
    recentLinkedInitials(),
  ]);
  return {
    linked,
    total,
    group: groupId && groupTotal > 0 ? { linked: groupLinked, total: groupTotal } : null,
    recent,
  };
}

/** Oxirgi ulaganlarning bosh harflari (reytingdan yashirilganlar chiqmaydi). groupIds — faqat shu guruhlardan */
export async function recentLinkedInitials(groupIds?: mongoose.Types.ObjectId[]): Promise<string[]> {
  const users = await User.find({
    role: "student",
    groupId: groupIds ? { $in: groupIds } : { $ne: null },
    ...LINKED,
    isHiddenFromLeaderboard: { $ne: true },
  })
    .sort({ "telegram.linkedAt": -1 })
    .limit(RECENT_LIMIT)
    .select("fullName")
    .lean();
  return users.map((u) => initialsOf(u.fullName ?? "")).filter(Boolean);
}
