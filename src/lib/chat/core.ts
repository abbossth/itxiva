import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { CHAT_MESSAGE_TTL_DAYS, ChatMessage, ChatRead, ChatRoom, type IChatRoom } from "@/lib/db/models/chat.model";
import { Group } from "@/lib/db/models/group.model";
import { User } from "@/lib/db/models/user.model";
import { groupShortName } from "@/lib/group-name";

// Chat qoidalari (server, "use server" emas):
// - Umumiy chat: hamma o'qiydi va yozadi.
// - O'quv guruhi chati: shu guruh o'quvchilari va mentorlar.
// - O'quvchilar guruhi (custom) va shaxsiy xabar (dm): faqat a'zolar yozadi. Mentor hammasini ko'radi va xabarni
//   o'chira oladi (bolalar xavfsizligi uchun kuzatuv) — bu chat oynasida ochiq yozilgan; a'zo bo'lmasa, yozmaydi.
// - Mentor yozishni taqiqlagan o'quvchi (`chatMutedUntil`) faqat o'qiydi.

export type Id = string | mongoose.Types.ObjectId;

export interface ChatViewer {
  userId: string;
  role: "mentor" | "student";
  groupId: string | null;
  fullName: string;
}

export const MAX_CUSTOM_MEMBERS = 60;
export const MAX_OWNED_GROUPS = 10;
export const MESSAGE_MAX = 2000;
/** O'qilmagan sonini ko'rsatishda chegara */
const UNREAD_CAP = 99;
/** Hech qachon ochilmagan xona: faqat shuncha kunlik xabarlar "o'qilmagan" sanaladi (yangi o'quvchida 99+ bo'lmasin) */
const FRESH_DAYS = 3;

const oid = (v: Id) => new mongoose.Types.ObjectId(String(v));
const objectIdAt = (date: Date) => mongoose.Types.ObjectId.createFromTime(Math.floor(date.getTime() / 1000));

export function dmKeyOf(a: Id, b: Id): string {
  return [String(a), String(b)].sort().join(":");
}

export async function ensureGeneralRoom(): Promise<IChatRoom> {
  await connectToDatabase();
  return (await ChatRoom.findOneAndUpdate(
    { kind: "general", groupId: null },
    { $setOnInsert: { kind: "general", groupId: null, members: [] } },
    { upsert: true, returnDocument: "after" }
  ).lean())!;
}

export async function ensureGroupRoom(groupId: Id): Promise<IChatRoom> {
  await connectToDatabase();
  return (await ChatRoom.findOneAndUpdate(
    { kind: "group", groupId: oid(groupId) },
    { $setOnInsert: { kind: "group", groupId: oid(groupId), members: [] } },
    { upsert: true, returnDocument: "after" }
  ).lean())!;
}

const isMember = (room: Pick<IChatRoom, "members">, userId: string) => room.members.some((m) => String(m) === userId);

/** Ko'ra oladimi */
export function canRead(room: Pick<IChatRoom, "kind" | "groupId" | "members">, v: ChatViewer): boolean {
  if (room.kind === "general") return true;
  if (v.role === "mentor") return true;
  if (room.kind === "group") return Boolean(v.groupId) && String(room.groupId) === v.groupId;
  return isMember(room, v.userId);
}

/** Yoza oladimi (taqiq alohida tekshiriladi) */
export function canWrite(room: Pick<IChatRoom, "kind" | "groupId" | "members">, v: ChatViewer): boolean {
  if (room.kind === "general" || room.kind === "group") return canRead(room, v);
  return isMember(room, v.userId);
}

export interface ChatRoomItem {
  id: string;
  kind: IChatRoom["kind"];
  title: string;
  subtitle: string;
  lastText: string | null;
  lastAt: string | null;
  unread: number;
  /** Mentor kuzatuvdagi xona (a'zo emas) */
  watching: boolean;
  ownerId: string | null;
  memberCount: number;
}

async function unreadCounts(rooms: IChatRoom[], userId: string): Promise<Map<string, number>> {
  const reads = await ChatRead.find({ userId: oid(userId), roomId: { $in: rooms.map((r) => r._id) } }).lean();
  const readOf = new Map(reads.map((r) => [String(r.roomId), r.lastReadId]));
  const fresh = objectIdAt(new Date(Date.now() - FRESH_DAYS * 86_400_000));
  const out = new Map<string, number>();
  await Promise.all(
    rooms.map(async (r) => {
      if (!r.lastMessageAt || Date.now() - new Date(r.lastMessageAt).getTime() > CHAT_MESSAGE_TTL_DAYS * 86_400_000) return out.set(String(r._id), 0);
      const after = readOf.get(String(r._id)) ?? fresh;
      const n = await ChatMessage.countDocuments(
        { roomId: r._id, _id: { $gt: after }, senderId: { $ne: oid(userId) }, deletedAt: null },
        { limit: UNREAD_CAP }
      );
      out.set(String(r._id), n);
    })
  );
  return out;
}

/** Foydalanuvchining xonalari (mentor uchun `watch` — a'zo bo'lmagan o'quvchilar guruhlari va shaxsiy xabarlar) */
export async function listRooms(v: ChatViewer, opts: { watch?: boolean } = {}): Promise<ChatRoomItem[]> {
  await connectToDatabase();
  let rooms: IChatRoom[];
  if (opts.watch && v.role === "mentor") {
    rooms = await ChatRoom.find({ kind: { $in: ["custom", "dm"] }, members: { $ne: oid(v.userId) }, lastMessageAt: { $ne: null } })
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .lean();
  } else {
    const general = await ensureGeneralRoom();
    const groupRooms: IChatRoom[] = [];
    if (v.role === "mentor") {
      const groups = await Group.find({ isActive: { $ne: false } }).select("_id").lean();
      for (const g of groups) groupRooms.push(await ensureGroupRoom(g._id));
    } else if (v.groupId) {
      groupRooms.push(await ensureGroupRoom(v.groupId));
    }
    const own = await ChatRoom.find({ kind: { $in: ["custom", "dm"] }, members: oid(v.userId) }).sort({ lastMessageAt: -1 }).limit(200).lean();
    rooms = [general, ...groupRooms, ...own];
  }

  // Nomlar: guruh nomi, shaxsiy xabarda — suhbatdosh ismi
  const groupIds = rooms.filter((r) => r.kind === "group").map((r) => r.groupId!);
  const groups = await Group.find({ _id: { $in: groupIds } }).select("name shortName grade").lean();
  const groupName = new Map(groups.map((g) => [String(g._id), groupShortName(g)]));
  const peopleIds = [...new Set(rooms.filter((r) => r.kind === "dm").flatMap((r) => r.members.map(String)))];
  const people = await User.find({ _id: { $in: peopleIds } }).select("fullName role groupId").lean();
  const personName = new Map(people.map((p) => [String(p._id), p.fullName]));
  const unread = opts.watch ? new Map<string, number>() : await unreadCounts(rooms, v.userId);

  // 7 kundan eski oxirgi xabar allaqachon o'chgan — ro'yxatda ko'rsatilmaydi
  const alive = (at?: Date | null) => Boolean(at) && Date.now() - new Date(at!).getTime() < CHAT_MESSAGE_TTL_DAYS * 86_400_000;
  return rooms.map((r) => {
    let title = "";
    let subtitle = "";
    if (r.kind === "general") {
      title = "Umumiy chat";
      subtitle = "Hamma o'quvchilar va ustozlar";
    } else if (r.kind === "group") {
      title = `${groupName.get(String(r.groupId)) ?? "Guruh"} guruhi`;
      subtitle = "O'quv guruhi chati";
    } else if (r.kind === "custom") {
      title = r.name || "Guruh";
      subtitle = `${r.members.length} a'zo`;
    } else {
      const others = r.members.map(String).filter((m) => m !== v.userId);
      title = opts.watch ? r.members.map((m) => personName.get(String(m)) ?? "?").join(" ↔ ") : personName.get(others[0] ?? "") ?? "Suhbat";
      subtitle = "Shaxsiy xabar";
    }
    return {
      id: String(r._id),
      kind: r.kind,
      title,
      subtitle,
      lastText: r.lastMessage && alive(r.lastMessageAt) ? `${r.lastMessage.senderName}: ${r.lastMessage.text}`.slice(0, 120) : null,
      lastAt: r.lastMessageAt ? new Date(r.lastMessageAt).toISOString() : null,
      unread: unread.get(String(r._id)) ?? 0,
      watching: Boolean(opts.watch),
      ownerId: r.ownerId ? String(r.ownerId) : null,
      memberCount: r.members.length,
    };
  });
}

/** Menyu nishoni uchun: barcha xonalardagi o'qilmaganlar */
export async function unreadTotal(v: ChatViewer): Promise<number> {
  const rooms = await listRooms(v);
  return rooms.reduce((n, r) => n + r.unread, 0);
}

export interface ChatMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "mentor" | "student";
  text: string;
  deleted: boolean;
  at: string;
}

export function toItem(m: { _id: unknown; senderId: unknown; senderName: string; senderRole: "mentor" | "student"; text: string; deletedAt?: Date | null; createdAt?: Date }): ChatMessageItem {
  return {
    id: String(m._id),
    senderId: String(m.senderId),
    senderName: m.senderName,
    senderRole: m.senderRole,
    text: m.deletedAt ? "" : m.text,
    deleted: Boolean(m.deletedAt),
    at: new Date(m.createdAt ?? Date.now()).toISOString(),
  };
}

/** Xabarlar: `after` dan keyingilar (yangilari) yoki `before` dan oldingi 50 tasi (tarix) */
export async function loadMessages(roomId: Id, opts: { after?: string | null; before?: string | null; limit?: number }): Promise<ChatMessageItem[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  if (opts.after && mongoose.isValidObjectId(opts.after)) {
    const list = await ChatMessage.find({ roomId: oid(roomId), _id: { $gt: oid(opts.after) } }).sort({ _id: 1 }).limit(limit).lean();
    return list.map(toItem);
  }
  const filter: Record<string, unknown> = { roomId: oid(roomId) };
  if (opts.before && mongoose.isValidObjectId(opts.before)) filter._id = { $lt: oid(opts.before) };
  const list = await ChatMessage.find(filter).sort({ _id: -1 }).limit(limit).lean();
  return list.reverse().map(toItem);
}

export async function markRead(roomId: Id, userId: string, lastId: string) {
  if (!mongoose.isValidObjectId(lastId)) return;
  // Faqat oldinga suriladi (eski so'rov yangisini bosib ketmasin)
  await ChatRead.updateOne(
    { userId: oid(userId), roomId: oid(roomId), $or: [{ lastReadId: { $lt: oid(lastId) } }, { lastReadId: { $exists: false } }] },
    { $set: { lastReadId: oid(lastId) } },
    { upsert: false }
  );
  await ChatRead.updateOne(
    { userId: oid(userId), roomId: oid(roomId) },
    { $setOnInsert: { lastReadId: oid(lastId) } },
    { upsert: true }
  );
}
