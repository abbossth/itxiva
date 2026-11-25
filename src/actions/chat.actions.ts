"use server";

// Chat amallari: xabar yuborish/o'chirish, shaxsiy suhbat, o'quvchilar guruhlari (yaratish, a'zo qo'shish/chiqarish,
// chiqish, nomini o'zgartirish), foydalanuvchi qidirish, mentor taqiqi. Ro'yxat va xabarlar — /api/chat/* (GET).

import mongoose from "mongoose";
import { unstable_rethrow } from "next/navigation";
import { connectToDatabase } from "@/lib/db/connect";
import { ChatMessage, ChatRoom } from "@/lib/db/models/chat.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { getCurrentUser, requireMentor } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { groupShortName } from "@/lib/group-name";
import { canRead, canWrite, dmKeyOf, MAX_CUSTOM_MEMBERS, MAX_OWNED_GROUPS, MESSAGE_MAX, toItem, type ChatMessageItem, type ChatViewer } from "@/lib/chat/core";

type Result<T> = { success: true; data: T } | { success: false; error: string };
const fail = (error: string): { success: false; error: string } => ({ success: false, error });
const oid = (v: string) => new mongoose.Types.ObjectId(v);
const validId = (v: unknown): v is string => typeof v === "string" && mongoose.isValidObjectId(v);

function errorOf(err: unknown, fallback: string) {
  unstable_rethrow(err);
  console.error(fallback, err);
  return fail(fallback);
}

async function viewer(): Promise<ChatViewer | null> {
  const s = await getCurrentUser();
  if (!s || s.mustChangePassword) return null;
  return { userId: s.userId, role: s.role, groupId: s.groupId ?? null, fullName: s.fullName };
}

/** Xabar matni: bo'sh joylar tozalanadi, ketma-ket 3 tadan ortiq bo'sh qator qoldirilmaydi */
function cleanText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, MESSAGE_MAX);
}

export async function sendChatMessageAction(roomId: string, text: string): Promise<Result<ChatMessageItem>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Suhbat topilmadi");
    const body = cleanText(text);
    if (!body) return fail("Xabar bo'sh");
    const rate = checkRateLimit(`chat_${v.userId}`, 20, 60_000);
    if (!rate.allowed) return fail(`Juda tez yozyapsiz. ${rate.resetInSeconds} soniyadan keyin`);
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || !canRead(room, v)) return fail("Suhbat topilmadi");
    if (!canWrite(room, v)) return fail("Bu suhbatga yoza olmaysiz");
    if (v.role === "student") {
      const me = await User.findById(v.userId).select("chatMutedUntil").lean();
      if (me?.chatMutedUntil && new Date(me.chatMutedUntil).getTime() > Date.now()) {
        return fail(`Ustoz sizga ${new Date(me.chatMutedUntil).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })} gacha yozishni taqiqlagan`);
      }
    }
    const msg = await ChatMessage.create({ roomId: room._id, senderId: v.userId, senderName: v.fullName, senderRole: v.role, text: body });
    await ChatRoom.updateOne(
      { _id: room._id },
      { $set: { lastMessageAt: msg.createdAt, lastMessage: { text: body.slice(0, 120), senderName: v.fullName.split(" ")[0] || v.fullName } } }
    );
    return { success: true, data: toItem(msg.toObject()) };
  } catch (err) {
    return errorOf(err, "Xabarni yuborib bo'lmadi");
  }
}

/** O'z xabarini (yoki mentor — istalgan xabarni) o'chirish */
export async function deleteChatMessageAction(messageId: string): Promise<Result<{ deleted: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(messageId)) return fail("Xabar topilmadi");
    await connectToDatabase();
    const msg = await ChatMessage.findById(messageId).lean();
    if (!msg) return fail("Xabar topilmadi");
    const room = await ChatRoom.findById(msg.roomId).lean();
    if (!room || !canRead(room, v)) return fail("Xabar topilmadi");
    if (v.role !== "mentor" && String(msg.senderId) !== v.userId) return fail("Faqat o'z xabaringizni o'chira olasiz");
    await ChatMessage.updateOne({ _id: msg._id, deletedAt: null }, { $set: { deletedAt: new Date(), deletedBy: v.userId } });
    if (v.role === "mentor" && String(msg.senderId) !== v.userId) {
      await AuditLog.create({ actorId: v.userId, action: "CHAT_DELETE_MESSAGE", details: { messageId: msg._id, roomId: room._id, senderId: msg.senderId, text: msg.text.slice(0, 300) } });
    }
    return { success: true, data: { deleted: true } };
  } catch (err) {
    return errorOf(err, "Xabarni o'chirib bo'lmadi");
  }
}

export interface ChatPerson {
  id: string;
  name: string;
  role: "mentor" | "student";
  group: string | null;
}

/** Shaxsiy xabar yoki guruhga qo'shish uchun odam qidirish (ism bo'yicha) */
export async function searchChatPeopleAction(query: string): Promise<Result<ChatPerson[]>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    const q = typeof query === "string" ? query.trim().slice(0, 40) : "";
    await connectToDatabase();
    const filter: Record<string, unknown> = { _id: { $ne: oid(v.userId) } };
    if (q) filter.fullName = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const users = await User.find(filter).select("fullName role groupId").sort({ role: 1, fullName: 1 }).limit(25).lean();
    const groupIds = users.map((u) => (u.groupId ? String(u.groupId) : null)).filter((g): g is string => Boolean(g));
    const groups = await Group.find({ _id: { $in: groupIds } }).select("name shortName").lean();
    const gname = new Map(groups.map((g) => [String(g._id), groupShortName(g)]));
    return {
      success: true,
      data: users.map((u) => ({ id: String(u._id), name: u.fullName, role: u.role, group: u.groupId ? gname.get(String(u.groupId)) ?? null : null })),
    };
  } catch (err) {
    return errorOf(err, "Qidirib bo'lmadi");
  }
}

/** Shaxsiy suhbatni ochish (bo'lmasa yaratiladi) */
export async function openDirectChatAction(userId: string): Promise<Result<{ roomId: string }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(userId) || userId === v.userId) return fail("Foydalanuvchi topilmadi");
    await connectToDatabase();
    if (!(await User.exists({ _id: userId }))) return fail("Foydalanuvchi topilmadi");
    const key = dmKeyOf(v.userId, userId);
    const room = await ChatRoom.findOneAndUpdate(
      { dmKey: key },
      { $setOnInsert: { kind: "dm", dmKey: key, members: [oid(v.userId), oid(userId)] } },
      { upsert: true, returnDocument: "after" }
    ).lean();
    return { success: true, data: { roomId: String(room!._id) } };
  } catch (err) {
    return errorOf(err, "Suhbatni ochib bo'lmadi");
  }
}

function cleanName(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 40) : "";
}

async function existingUserIds(ids: unknown): Promise<string[]> {
  const list = (Array.isArray(ids) ? ids : []).filter(validId);
  if (list.length === 0) return [];
  const found = await User.find({ _id: { $in: [...new Set(list)].map(oid) } }).select("_id").lean();
  return found.map((u) => String(u._id));
}

/** O'quvchi (yoki mentor) yangi chat guruhi yaratadi: nom va a'zolar */
export async function createChatGroupAction(name: string, memberIds: string[]): Promise<Result<{ roomId: string }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    const title = cleanName(name);
    if (title.length < 3) return fail("Guruh nomi kamida 3 ta belgi bo'lsin");
    const rate = checkRateLimit(`chat_group_${v.userId}`, 5, 60_000);
    if (!rate.allowed) return fail("Juda ko'p urinish — birozdan keyin");
    await connectToDatabase();
    if ((await ChatRoom.countDocuments({ kind: "custom", ownerId: oid(v.userId) })) >= MAX_OWNED_GROUPS) {
      return fail(`Ko'pi bilan ${MAX_OWNED_GROUPS} ta guruh yarata olasiz`);
    }
    const members = [v.userId, ...(await existingUserIds(memberIds)).filter((id) => id !== v.userId)].slice(0, MAX_CUSTOM_MEMBERS);
    if (members.length < 2) return fail("Kamida bitta a'zo qo'shing");
    const room = await ChatRoom.create({ kind: "custom", name: title, ownerId: v.userId, members: members.map(oid) });
    await ChatMessage.create({ roomId: room._id, senderId: v.userId, senderName: v.fullName, senderRole: v.role, text: `"${title}" guruhini yaratdi 👋` });
    await ChatRoom.updateOne({ _id: room._id }, { $set: { lastMessageAt: new Date(), lastMessage: { text: "guruh yaratildi", senderName: v.fullName.split(" ")[0] } } });
    return { success: true, data: { roomId: String(room._id) } };
  } catch (err) {
    return errorOf(err, "Guruhni yaratib bo'lmadi");
  }
}

async function ownedGroup(roomId: string, v: ChatViewer) {
  if (!validId(roomId)) return null;
  const room = await ChatRoom.findById(roomId).lean();
  if (!room || room.kind !== "custom") return null;
  // Guruhni yaratgan o'quvchi yoki mentor boshqaradi
  if (String(room.ownerId) !== v.userId && v.role !== "mentor") return null;
  return room;
}

async function systemNote(roomId: mongoose.Types.ObjectId, v: ChatViewer, text: string) {
  await ChatMessage.create({ roomId, senderId: v.userId, senderName: v.fullName, senderRole: v.role, text });
  await ChatRoom.updateOne({ _id: roomId }, { $set: { lastMessageAt: new Date(), lastMessage: { text: text.slice(0, 120), senderName: v.fullName.split(" ")[0] } } });
}

export async function addChatMembersAction(roomId: string, userIds: string[]): Promise<Result<{ members: number }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    await connectToDatabase();
    const room = await ownedGroup(roomId, v);
    if (!room) return fail("Faqat guruh egasi a'zo qo'sha oladi");
    const current = new Set(room.members.map(String));
    const add = (await existingUserIds(userIds)).filter((id) => !current.has(id));
    if (add.length === 0) return fail("Yangi a'zo tanlanmadi");
    if (current.size + add.length > MAX_CUSTOM_MEMBERS) return fail(`Guruhda ko'pi bilan ${MAX_CUSTOM_MEMBERS} kishi bo'ladi`);
    await ChatRoom.updateOne({ _id: room._id }, { $addToSet: { members: { $each: add.map(oid) } } });
    const names = (await User.find({ _id: { $in: add.map(oid) } }).select("fullName").lean()).map((u) => u.fullName.split(" ").slice(0, 2).join(" "));
    await systemNote(room._id, v, `${names.join(", ")} guruhga qo'shildi`);
    return { success: true, data: { members: current.size + add.length } };
  } catch (err) {
    return errorOf(err, "A'zo qo'shib bo'lmadi");
  }
}

export async function removeChatMemberAction(roomId: string, userId: string): Promise<Result<{ members: number }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(userId)) return fail("Foydalanuvchi topilmadi");
    await connectToDatabase();
    const room = await ownedGroup(roomId, v);
    if (!room) return fail("Faqat guruh egasi a'zoni chiqara oladi");
    if (String(room.ownerId) === userId) return fail("Guruh egasini chiqarib bo'lmaydi");
    if (!room.members.some((m) => String(m) === userId)) return fail("Bu odam guruhda yo'q");
    await ChatRoom.updateOne({ _id: room._id }, { $pull: { members: oid(userId) } });
    const u = await User.findById(userId).select("fullName").lean();
    await systemNote(room._id, v, `${u?.fullName ?? "A'zo"} guruhdan chiqarildi`);
    return { success: true, data: { members: room.members.length - 1 } };
  } catch (err) {
    return errorOf(err, "A'zoni chiqarib bo'lmadi");
  }
}

/** Guruhdan o'zi chiqish. Egasi chiqsa — guruh boshqa a'zoga o'tadi; hech kim qolmasa — guruh o'chadi */
export async function leaveChatGroupAction(roomId: string): Promise<Result<{ left: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Guruh topilmadi");
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || room.kind !== "custom" || !room.members.some((m) => String(m) === v.userId)) return fail("Guruh topilmadi");
    const rest = room.members.filter((m) => String(m) !== v.userId);
    if (rest.length === 0) {
      await ChatMessage.deleteMany({ roomId: room._id });
      await ChatRoom.deleteOne({ _id: room._id });
      return { success: true, data: { left: true } };
    }
    const newOwner = String(room.ownerId) === v.userId ? rest[0] : room.ownerId;
    await ChatRoom.updateOne({ _id: room._id }, { $set: { members: rest, ownerId: newOwner } });
    await systemNote(room._id, v, "guruhdan chiqdi");
    return { success: true, data: { left: true } };
  } catch (err) {
    return errorOf(err, "Guruhdan chiqib bo'lmadi");
  }
}

export async function renameChatGroupAction(roomId: string, name: string): Promise<Result<{ name: string }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    const title = cleanName(name);
    if (title.length < 3) return fail("Guruh nomi kamida 3 ta belgi bo'lsin");
    await connectToDatabase();
    const room = await ownedGroup(roomId, v);
    if (!room) return fail("Faqat guruh egasi nomini o'zgartira oladi");
    await ChatRoom.updateOne({ _id: room._id }, { $set: { name: title } });
    await systemNote(room._id, v, `guruh nomini "${title}" ga o'zgartirdi`);
    return { success: true, data: { name: title } };
  } catch (err) {
    return errorOf(err, "Nomni o'zgartirib bo'lmadi");
  }
}

export interface ChatMember {
  id: string;
  name: string;
  role: "mentor" | "student";
  owner: boolean;
}

/** O'quvchilar guruhi a'zolari */
export async function getChatMembersAction(roomId: string): Promise<Result<ChatMember[]>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Guruh topilmadi");
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || !canRead(room, v) || (room.kind !== "custom" && room.kind !== "dm")) return fail("Guruh topilmadi");
    const users = await User.find({ _id: { $in: room.members } }).select("fullName role").sort({ fullName: 1 }).lean();
    return { success: true, data: users.map((u) => ({ id: String(u._id), name: u.fullName, role: u.role, owner: String(room.ownerId) === String(u._id) })) };
  } catch (err) {
    return errorOf(err, "A'zolarni olib bo'lmadi");
  }
}

/** Mentor: o'quvchiga chatda yozishni vaqtincha taqiqlash (0 — taqiqni olib tashlash) */
export async function muteChatUserAction(userId: string, hours: number): Promise<Result<{ until: string | null }>> {
  try {
    const mentor = await requireMentor();
    if (!validId(userId)) return fail("Foydalanuvchi topilmadi");
    const h = Math.max(0, Math.min(24 * 30, Math.round(Number(hours) || 0)));
    await connectToDatabase();
    const until = h > 0 ? new Date(Date.now() + h * 3_600_000) : null;
    const res = await User.updateOne({ _id: userId, role: "student" }, { $set: { chatMutedUntil: until } });
    if (res.matchedCount === 0) return fail("O'quvchi topilmadi");
    await AuditLog.create({ actorId: mentor.userId, action: "CHAT_MUTE", details: { userId, hours: h } });
    return { success: true, data: { until: until ? until.toISOString() : null } };
  } catch (err) {
    return errorOf(err, "Taqiq qo'yib bo'lmadi");
  }
}
