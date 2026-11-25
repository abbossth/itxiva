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
import { canRead, dmKeyOf, isGroupAdmin, setRoomMuted, MAX_CUSTOM_MEMBERS, MAX_OWNED_GROUPS, MESSAGE_MAX, postChatMessage, type ChatMessageItem, type ChatViewer } from "@/lib/chat/core";
import { notifyMentors } from "@/lib/notifications/notify";
import { isSticker } from "@/lib/chat/stickers";

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

export async function sendChatMessageAction(roomId: string, text: string, replyToId?: string | null, mentionIds?: string[]): Promise<Result<ChatMessageItem>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Suhbat topilmadi");
    const body = cleanText(text);
    if (!body) return fail("Xabar bo'sh");
    const rate = checkRateLimit(`chat_${v.userId}`, 20, 60_000);
    if (!rate.allowed) return fail(`Juda tez yozyapsiz. ${rate.resetInSeconds} soniyadan keyin`);
    const r = await postChatMessage(roomId, v, {
      text: body,
      replyToId: validId(replyToId) ? replyToId : null,
      mentionIds: Array.isArray(mentionIds) ? mentionIds.filter((x): x is string => typeof x === "string").slice(0, 10) : [],
    });
    if (!r.ok) return fail(r.error);
    return { success: true, data: r.item };
  } catch (err) {
    return errorOf(err, "Xabarni yuborib bo'lmadi");
  }
}

/** O'z xabarini (yoki mentor — istalgan xabarni) o'chirish */
/** Stiker yuborish */
export async function sendChatStickerAction(roomId: string, sticker: string, replyToId?: string | null): Promise<Result<ChatMessageItem>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId) || !isSticker(sticker)) return fail("Stiker topilmadi");
    const rate = checkRateLimit(`chat_${v.userId}`, 20, 60_000);
    if (!rate.allowed) return fail(`Juda tez yozyapsiz. ${rate.resetInSeconds} soniyadan keyin`);
    const r = await postChatMessage(roomId, v, { sticker, replyToId: validId(replyToId) ? replyToId : null });
    return r.ok ? { success: true, data: r.item } : fail(r.error);
  } catch (err) {
    return errorOf(err, "Stikerni yuborib bo'lmadi");
  }
}

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
    await ChatMessage.updateOne({ _id: msg._id, deletedAt: null }, { $set: { deletedAt: new Date(), deletedBy: v.userId, changedAt: new Date() } });
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

/** @belgilash uchun: shu suhbatni ko'ra oladigan odamlar (ism bo'yicha) */
export async function chatMentionCandidatesAction(roomId: string, query: string): Promise<Result<ChatPerson[]>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Suhbat topilmadi");
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || !canRead(room, v)) return fail("Suhbat topilmadi");
    const q = typeof query === "string" ? query.trim().slice(0, 40) : "";
    const filter: Record<string, unknown> = { _id: { $ne: oid(v.userId) } };
    if (q) filter.fullName = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (room.kind === "dm" || room.kind === "custom") filter._id = { $in: room.members.filter((m) => String(m) !== v.userId) };
    else if (room.kind === "group") filter.$or = [{ role: "mentor" }, { groupId: room.groupId }];
    const users = await User.find(filter).select("fullName role groupId").sort({ role: 1, fullName: 1 }).limit(8).lean();
    return { success: true, data: users.map((u) => ({ id: String(u._id), name: u.fullName, role: u.role, group: null })) };
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
    if (await User.exists({ _id: userId, chatBlocked: oid(v.userId) })) return fail("Bu foydalanuvchi sizdan xabar qabul qilmaydi");
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

/** Guruhni boshqara oladigan: egasi, adminlari yoki mentor */
async function ownedGroup(roomId: string, v: ChatViewer) {
  if (!validId(roomId)) return null;
  const room = await ChatRoom.findById(roomId).lean();
  if (!room || room.kind !== "custom") return null;
  if (!isGroupAdmin(room, v.userId) && v.role !== "mentor") return null;
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
    const candidates = (await existingUserIds(userIds)).filter((id) => !current.has(id));
    // Sizni bloklagan odamni guruhga qo'shib bo'lmaydi
    const blockers = new Set((await User.find({ _id: { $in: candidates.map(oid) }, chatBlocked: oid(v.userId) }).select("_id").lean()).map((u) => String(u._id)));
    const add = candidates.filter((id) => !blockers.has(id));
    if (add.length === 0) return fail(blockers.size ? "Tanlangan odam(lar)ni qo'shib bo'lmaydi" : "Yangi a'zo tanlanmadi");
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
    // Admin boshqa adminni chiqara olmaydi — faqat egasi yoki mentor
    if (isGroupAdmin(room, userId) && String(room.ownerId) !== v.userId && v.role !== "mentor") return fail("Adminni faqat guruh egasi chiqara oladi");
    await ChatRoom.updateOne({ _id: room._id }, { $pull: { members: oid(userId), admins: oid(userId) } });
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
    // Egasi chiqsa — guruh avval adminga, admin bo'lmasa birinchi a'zoga o'tadi
    const admins = (room.admins ?? []).filter((a) => String(a) !== v.userId);
    const newOwner = String(room.ownerId) === v.userId ? admins.find((a) => rest.some((m) => String(m) === String(a))) ?? rest[0] : room.ownerId;
    await ChatRoom.updateOne({ _id: room._id }, { $set: { members: rest, ownerId: newOwner, admins: admins.filter((a) => String(a) !== String(newOwner)) } });
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
  admin: boolean;
}

export interface ChatGroupInfo {
  members: ChatMember[];
  name: string;
  onlyAdmins: boolean;
  /** Joriy foydalanuvchi: egasi / admin (boshqara oladi) */
  canManage: boolean;
  isOwner: boolean;
}

/** Guruh (yoki shaxsiy suhbat) a'zolari va sozlamalari */
export async function getChatMembersAction(roomId: string): Promise<Result<ChatGroupInfo>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Guruh topilmadi");
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || !canRead(room, v) || (room.kind !== "custom" && room.kind !== "dm")) return fail("Guruh topilmadi");
    const users = await User.find({ _id: { $in: room.members } }).select("fullName role").sort({ fullName: 1 }).lean();
    return {
      success: true,
      data: {
        members: users.map((u) => ({
          id: String(u._id),
          name: u.fullName,
          role: u.role,
          owner: String(room.ownerId) === String(u._id),
          admin: room.kind === "custom" && isGroupAdmin(room, String(u._id)),
        })),
        name: room.name ?? "",
        onlyAdmins: Boolean(room.onlyAdmins),
        canManage: room.kind === "custom" && (isGroupAdmin(room, v.userId) || v.role === "mentor"),
        isOwner: String(room.ownerId) === v.userId || (room.kind === "custom" && v.role === "mentor"),
      },
    };
  } catch (err) {
    return errorOf(err, "A'zolarni olib bo'lmadi");
  }
}

/** Egasi (yoki mentor): a'zoni admin qilish / adminlikdan olish */
export async function setChatAdminAction(roomId: string, userId: string, admin: boolean): Promise<Result<{ admin: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId) || !validId(userId)) return fail("Topilmadi");
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || room.kind !== "custom") return fail("Guruh topilmadi");
    if (String(room.ownerId) !== v.userId && v.role !== "mentor") return fail("Adminlarni faqat guruh egasi tayinlaydi");
    if (!room.members.some((m) => String(m) === userId) || String(room.ownerId) === userId) return fail("Bu a'zoni o'zgartirib bo'lmaydi");
    await ChatRoom.updateOne({ _id: room._id }, admin ? { $addToSet: { admins: oid(userId) } } : { $pull: { admins: oid(userId) } });
    const u = await User.findById(userId).select("fullName").lean();
    await systemNote(room._id, v, admin ? `${u?.fullName ?? "A'zo"} admin qilindi` : `${u?.fullName ?? "A'zo"} adminlikdan olindi`);
    return { success: true, data: { admin } };
  } catch (err) {
    return errorOf(err, "O'zgartirib bo'lmadi");
  }
}

/** Egasi/admin: "faqat adminlar yozadi" rejimi */
export async function setChatOnlyAdminsAction(roomId: string, on: boolean): Promise<Result<{ onlyAdmins: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    await connectToDatabase();
    const room = await ownedGroup(roomId, v);
    if (!room) return fail("Faqat guruh egasi yoki admini o'zgartira oladi");
    await ChatRoom.updateOne({ _id: room._id }, { $set: { onlyAdmins: on === true } });
    await systemNote(room._id, v, on ? "endi faqat adminlar yoza oladi" : "endi hamma a'zolar yoza oladi");
    return { success: true, data: { onlyAdmins: on === true } };
  } catch (err) {
    return errorOf(err, "O'zgartirib bo'lmadi");
  }
}

/** Egasi (yoki mentor): guruhni butunlay o'chirish */
export async function deleteChatGroupAction(roomId: string): Promise<Result<{ deleted: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Guruh topilmadi");
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || room.kind !== "custom") return fail("Guruh topilmadi");
    if (String(room.ownerId) !== v.userId && v.role !== "mentor") return fail("Guruhni faqat egasi o'chira oladi");
    await ChatMessage.deleteMany({ roomId: room._id });
    await ChatRoom.deleteOne({ _id: room._id });
    if (v.role === "mentor") await AuditLog.create({ actorId: v.userId, action: "CHAT_DELETE_GROUP", details: { roomId: room._id, name: room.name } });
    return { success: true, data: { deleted: true } };
  } catch (err) {
    return errorOf(err, "Guruhni o'chirib bo'lmadi");
  }
}

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

/** Reaksiya qo'yish/olib tashlash (bir odam — bitta reaksiya; xuddi shunisi qayta bosilsa olinadi) */
export async function toggleChatReactionAction(messageId: string, emoji: string): Promise<Result<{ emoji: string | null }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(messageId) || !REACTIONS.includes(emoji)) return fail("Noto'g'ri reaksiya");
    const rate = checkRateLimit(`chat_react_${v.userId}`, 60, 60_000);
    if (!rate.allowed) return fail("Juda tez");
    await connectToDatabase();
    const msg = await ChatMessage.findById(messageId).select("roomId reactions deletedAt").lean();
    if (!msg || msg.deletedAt) return fail("Xabar topilmadi");
    const room = await ChatRoom.findById(msg.roomId).lean();
    if (!room || !canRead(room, v)) return fail("Xabar topilmadi");
    const had = (msg.reactions ?? []).find((r) => String(r.userId) === v.userId);
    const next = had?.emoji === emoji ? null : emoji;
    await ChatMessage.updateOne({ _id: msg._id }, { $pull: { reactions: { userId: oid(v.userId) } }, $set: { changedAt: new Date() } });
    if (next) await ChatMessage.updateOne({ _id: msg._id }, { $push: { reactions: { emoji: next, userId: oid(v.userId) } } });
    return { success: true, data: { emoji: next } };
  } catch (err) {
    return errorOf(err, "Reaksiya qo'yib bo'lmadi");
  }
}

/** Xabar ustidan ustozga shikoyat: mentorlarga Telegram va amallar tarixi */
export async function reportChatMessageAction(messageId: string, reason: string): Promise<Result<{ reported: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(messageId)) return fail("Xabar topilmadi");
    const rate = checkRateLimit(`chat_report_${v.userId}`, 5, 10 * 60_000);
    if (!rate.allowed) return fail("Juda ko'p shikoyat — birozdan keyin");
    await connectToDatabase();
    const msg = await ChatMessage.findById(messageId).lean();
    if (!msg) return fail("Xabar topilmadi");
    const room = await ChatRoom.findById(msg.roomId).lean();
    if (!room || !canRead(room, v)) return fail("Xabar topilmadi");
    const why = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    await AuditLog.create({ actorId: v.userId, action: "CHAT_REPORT", details: { messageId: msg._id, roomId: room._id, senderId: msg.senderId, text: msg.text.slice(0, 300), reason: why } });
    notifyMentors("chat_message", {
      roomId: String(room._id),
      roomTitle: "⚠️ Shikoyat",
      senderName: `${v.fullName} → ${msg.senderName}`,
      text: `${msg.text ? `"${msg.text.slice(0, 200)}"` : "(rasm/ovozli xabar)"}${why ? `\nSabab: ${why}` : ""}`,
    });
    return { success: true, data: { reported: true } };
  } catch (err) {
    return errorOf(err, "Shikoyat yuborib bo'lmadi");
  }
}

/** Odamni bloklash: u shaxsiy xabar yoza olmaydi va sizni guruhga qo'sha olmaydi */
export async function setChatBlockAction(userId: string, blocked: boolean): Promise<Result<{ blocked: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(userId) || userId === v.userId) return fail("Foydalanuvchi topilmadi");
    await connectToDatabase();
    const target = await User.findById(userId).select("role").lean();
    if (!target) return fail("Foydalanuvchi topilmadi");
    if (blocked && target.role === "mentor") return fail("Ustozni bloklab bo'lmaydi");
    await User.updateOne({ _id: v.userId }, blocked ? { $addToSet: { chatBlocked: oid(userId) } } : { $pull: { chatBlocked: oid(userId) } });
    return { success: true, data: { blocked } };
  } catch (err) {
    return errorOf(err, "Bloklab bo'lmadi");
  }
}

/** Men bloklaganlar (id) */
export async function getChatBlockedAction(): Promise<Result<string[]>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    await connectToDatabase();
    const me = await User.findById(v.userId).select("chatBlocked").lean();
    return { success: true, data: (me?.chatBlocked ?? []).map(String) };
  } catch (err) {
    return errorOf(err, "Ro'yxatni olib bo'lmadi");
  }
}

/** Suhbatni ovozsiz qilish (shaxsiy suhbatda — shu odamning xabarlari) / qaytarish */
export async function setChatRoomMuteAction(roomId: string, muted: boolean): Promise<Result<{ muted: boolean }>> {
  try {
    const v = await viewer();
    if (!v) return fail("Tizimga kiring");
    if (!validId(roomId)) return fail("Suhbat topilmadi");
    await connectToDatabase();
    const room = await ChatRoom.findById(roomId).lean();
    if (!room || !canRead(room, v)) return fail("Suhbat topilmadi");
    await setRoomMuted(room._id, v.userId, muted === true);
    return { success: true, data: { muted: muted === true } };
  } catch (err) {
    return errorOf(err, "O'zgartirib bo'lmadi");
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
