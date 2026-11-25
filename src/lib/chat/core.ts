import { isSticker } from "./stickers";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { CHAT_MESSAGE_TTL_DAYS, ChatMessage, ChatRead, ChatRoom, ChatTyping, type IChatRoom } from "@/lib/db/models/chat.model";
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
export function canWrite(room: Pick<IChatRoom, "kind" | "groupId" | "members" | "onlyAdmins" | "ownerId" | "admins">, v: ChatViewer): boolean {
  if (room.kind === "general" || room.kind === "group") return canRead(room, v);
  if (!isMember(room, v.userId)) return false;
  // "Faqat adminlar yozadi" rejimidagi guruh
  if (room.kind === "custom" && room.onlyAdmins) return isGroupAdmin(room, v.userId);
  return true;
}

/** Guruh egasi yoki admini */
export function isGroupAdmin(room: Pick<IChatRoom, "ownerId" | "admins">, userId: string): boolean {
  return String(room.ownerId) === userId || (room.admins ?? []).some((a) => String(a) === userId);
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
  /** Ovozsiz (bildirishnomalar o'chiq) */
  muted: boolean;
}

async function unreadCounts(rooms: IChatRoom[], userId: string, mutedOut?: Set<string>): Promise<Map<string, number>> {
  const reads = await ChatRead.find({ userId: oid(userId), roomId: { $in: rooms.map((r) => r._id) } }).lean();
  const readOf = new Map(reads.map((r) => [String(r.roomId), r.lastReadId]));
  for (const r of reads) if (r.muted) mutedOut?.add(String(r.roomId));
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
      // Bitta so'rov bilan; faqat hali chati yo'q guruhlar uchun yaratiladi (har 10–20 s da so'raladi)
      const groups = await Group.find({ isActive: { $ne: false } }).select("_id").lean();
      const existing = await ChatRoom.find({ kind: "group", groupId: { $in: groups.map((g) => g._id) } }).lean();
      const have = new Map(existing.map((r) => [String(r.groupId), r]));
      for (const g of groups) groupRooms.push(have.get(String(g._id)) ?? (await ensureGroupRoom(g._id)));
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
  const muted = new Set<string>();
  const unread = opts.watch ? new Map<string, number>() : await unreadCounts(rooms, v.userId, muted);

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
      muted: muted.has(String(r._id)),
    };
  });
}

/** Menyu nishoni uchun: barcha xonalardagi o'qilmaganlar */
export async function unreadTotal(v: ChatViewer): Promise<number> {
  const rooms = await listRooms(v);
  return rooms.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0);
}

export interface ChatMessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "mentor" | "student";
  text: string;
  /** Ovozli xabar: eshitish manzili /api/chat/media?m=<id> */
  voice: { duration: number } | null;
  /** Rasm: ko'rish manzili /api/chat/media?m=<id> */
  image: { width: number; height: number } | null;
  /** Stiker */
  sticker: string | null;
  /** Javob berilgan xabar */
  replyTo: { id: string; senderName: string; text: string } | null;
  /** Reaksiyalar: emoji va qo'yganlar id'si */
  reactions: { emoji: string; users: string[] }[];
  deleted: boolean;
  at: string;
}

export function toItem(m: {
  _id: unknown;
  senderId: unknown;
  senderName: string;
  senderRole: "mentor" | "student";
  text?: string;
  voice?: { duration: number } | null;
  image?: { width: number; height: number } | null;
  sticker?: string | null;
  replyTo?: { id: unknown; senderName: string; text: string } | null;
  reactions?: { emoji: string; userId: unknown }[];
  deletedAt?: Date | null;
  createdAt?: Date;
}): ChatMessageItem {
  const gone = Boolean(m.deletedAt);
  const reactions = new Map<string, string[]>();
  if (!gone) for (const r of m.reactions ?? []) reactions.set(r.emoji, [...(reactions.get(r.emoji) ?? []), String(r.userId)]);
  return {
    id: String(m._id),
    senderId: String(m.senderId),
    senderName: m.senderName,
    senderRole: m.senderRole,
    text: gone ? "" : m.text ?? "",
    voice: m.voice && !gone ? { duration: m.voice.duration } : null,
    image: m.image && !gone ? { width: m.image.width, height: m.image.height } : null,
    sticker: m.sticker && !gone ? m.sticker : null,
    replyTo: m.replyTo && !gone ? { id: String(m.replyTo.id), senderName: m.replyTo.senderName, text: m.replyTo.text } : null,
    reactions: [...reactions].map(([emoji, users]) => ({ emoji, users })),
    deleted: gone,
    at: new Date(m.createdAt ?? Date.now()).toISOString(),
  };
}

// ---- Bildirishnomalar ----

/** Suhbat ochiq turibdi deb hisoblanadigan vaqt (shu orada Telegram xabari yuborilmaydi) */
const SEEN_FRESH_MS = 60_000;
/** Bitta suhbatdan bitta odamga Telegram xabari — ko'pi bilan shuncha vaqtda bir marta */
const NOTIFY_GAP_MS = 10 * 60_000;
const seenWrites = new Map<string, number>();

/** Foydalanuvchi suhbatni ochib turibdi (har so'rovda emas — 20 soniyada bir marta yoziladi) */
export async function markSeen(roomId: Id, userId: string) {
  const key = `${roomId}:${userId}`;
  const now = Date.now();
  if (now - (seenWrites.get(key) ?? 0) < 20_000) return;
  seenWrites.set(key, now);
  if (seenWrites.size > 20_000) seenWrites.clear();
  await ChatRead.updateOne(
    { userId: oid(userId), roomId: oid(roomId) },
    { $set: { seenAt: new Date(now) }, $setOnInsert: { lastReadId: objectIdAt(new Date(now)) } },
    { upsert: true }
  );
}

/**
 * Kimlarga Telegram xabari yuboriladi: shaxsiy xabar va o'quvchilar guruhlarida — yozgandan boshqa a'zolar,
 * agar suhbat hozir ochiq bo'lmasa va oxirgi xabardan 10 daqiqa o'tgan bo'lsa. Ular `notifiedAt` bilan belgilanadi.
 * Umumiy va o'quv guruhi chatlari uchun yuborilmaydi (juda ko'p bo'lib ketadi).
 */
/** Push uchun: suhbat shu vaqt ichida ochiq turgan bo'lsa — yuborilmaydi */
const PUSH_SEEN_MS = 20_000;

/**
 * Kimga xabar beriladi:
 * - push — shaxsiy xabar va guruhlarda hamma a'zolarga (har xabar; brauzer bir suhbatni bitta bildirishnomaga yig'adi),
 *   istalgan suhbatda esa xabariga javob berilgan odamga;
 * - Telegram — faqat shaxsiy xabar va guruhlarda, bir suhbat bo'yicha 10 daqiqada bir marta.
 * Suhbatni ovozsiz qilganlar va hozir ochib turganlar chiqarib tashlanadi.
 */
export async function chatNotifyTargets(
  room: Pick<IChatRoom, "_id" | "kind" | "members">,
  senderId: string,
  opts: { now?: Date; replyToUserId?: string | null } = {}
): Promise<{ telegram: string[]; push: string[] }> {
  const now = opts.now ?? new Date();
  const members = room.kind === "dm" || room.kind === "custom" ? room.members.map(String) : [];
  const reply = opts.replyToUserId && opts.replyToUserId !== senderId ? [opts.replyToUserId] : [];
  const others = [...new Set([...members, ...reply])].filter((m) => m !== senderId);
  if (others.length === 0) return { telegram: [], push: [] };
  const reads = await ChatRead.find({ roomId: room._id, userId: { $in: others.map(oid) } }).select("userId seenAt notifiedAt muted").lean();
  const byUser = new Map(reads.map((r) => [String(r.userId), r]));
  const ago = (d?: Date | null) => (d ? now.getTime() - new Date(d).getTime() : Infinity);
  const push = others.filter((u) => {
    const r = byUser.get(u);
    return !r?.muted && ago(r?.seenAt) >= PUSH_SEEN_MS;
  });
  const telegram = members
    .filter((u) => u !== senderId)
    .filter((u) => {
      const r = byUser.get(u);
      return !r?.muted && ago(r?.seenAt) >= SEEN_FRESH_MS && ago(r?.notifiedAt) >= NOTIFY_GAP_MS;
    });
  if (telegram.length > 0) {
    // Yangi ChatRead yozuvi (hech qachon ochilmagan): o'qilgan joy — juda eski, ya'ni hamma xabar o'qilmagan
    await ChatRead.bulkWrite(
      telegram.map((u) => ({
        updateOne: {
          filter: { userId: oid(u), roomId: room._id },
          update: { $set: { notifiedAt: now }, $setOnInsert: { lastReadId: objectIdAt(new Date(0)) } },
          upsert: true,
        },
      }))
    );
  }
  return { telegram, push };
}

/** Suhbatni ovozsiz qilish / qaytarish */
export async function setRoomMuted(roomId: Id, userId: string, muted: boolean) {
  await ChatRead.updateOne(
    { userId: oid(userId), roomId: oid(roomId) },
    { $set: { muted }, $setOnInsert: { lastReadId: objectIdAt(new Date(Date.now() - FRESH_DAYS * 86_400_000)) } },
    { upsert: true }
  );
}

/** Xabarlar: `after` dan keyingilar (yangilari) yoki `before` dan oldingi 50 tasi (tarix) */
export async function loadMessages(roomId: Id, opts: { after?: string | null; before?: string | null; limit?: number }): Promise<ChatMessageItem[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  if (opts.after && mongoose.isValidObjectId(opts.after)) {
    const list = await ChatMessage.find({ roomId: oid(roomId), _id: { $gt: oid(opts.after) } }).sort({ _id: 1 }).limit(limit).lean();
    return list.map((m) => toItem(m));
  }
  const filter: Record<string, unknown> = { roomId: oid(roomId) };
  if (opts.before && mongoose.isValidObjectId(opts.before)) filter._id = { $lt: oid(opts.before) };
  const list = await ChatMessage.find(filter).sort({ _id: -1 }).limit(limit).lean();
  return list.reverse().map((m) => toItem(m));
}

/** `since` dan keyin o'zgargan (reaksiya, o'chirish) xabarlar — ochiq suhbatni yangilash uchun */
export async function loadChanged(roomId: Id, since: Date): Promise<ChatMessageItem[]> {
  const list = await ChatMessage.find({ roomId: oid(roomId), changedAt: { $gt: since } }).sort({ changedAt: 1 }).limit(100).lean();
  return list.map((m) => toItem(m));
}

/** Xabar tavsifi: ro'yxatda, iqtibosda va bildirishnomada */
export function previewOf(m: { text?: string; voice?: unknown; image?: unknown; sticker?: string | null }): string {
  if (m.sticker) return `${m.sticker} Stiker`;
  if (m.voice) return "🎤 Ovozli xabar";
  if (m.image) return m.text ? `🖼 ${m.text}` : "🖼 Rasm";
  return m.text ?? "";
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

// ---- Xabar yuborish (matn va ovozli xabar uchun umumiy) ----

export type PostResult = { ok: true; item: ChatMessageItem } | { ok: false; error: string };

/** Xabarni yozadi: ruxsat va taqiq tekshiriladi, oxirgi xabar yangilanadi, kerak bo'lsa Telegram xabari ketadi */
export async function postChatMessage(
  roomId: Id,
  v: ChatViewer,
  body: {
    text?: string;
    voice?: { key: string; mime: string; duration: number; size: number };
    image?: { key: string; mime: string; width: number; height: number; size: number };
    sticker?: string;
    replyToId?: string | null;
  }
): Promise<PostResult> {
  await connectToDatabase();
  const room = await ChatRoom.findById(roomId).lean();
  if (!room || !canRead(room, v)) return { ok: false, error: "Suhbat topilmadi" };
  if (!canWrite(room, v)) return { ok: false, error: room.onlyAdmins ? "Bu guruhda faqat adminlar yozadi" : "Bu suhbatga yoza olmaysiz" };
  if (v.role === "student") {
    const me = await User.findById(v.userId).select("chatMutedUntil").lean();
    if (me?.chatMutedUntil && new Date(me.chatMutedUntil).getTime() > Date.now()) {
      return { ok: false, error: `Ustoz sizga ${new Date(me.chatMutedUntil).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })} gacha yozishni taqiqlagan` };
    }
  }
  // Shaxsiy xabar: suhbatdosh bloklagan bo'lsa — yozib bo'lmaydi
  if (room.kind === "dm") {
    const other = room.members.map(String).find((m) => m !== v.userId);
    if (other && (await User.exists({ _id: oid(other), chatBlocked: oid(v.userId) }))) return { ok: false, error: "Bu foydalanuvchi sizdan xabar qabul qilmaydi" };
  }
  let replyTo: { id: mongoose.Types.ObjectId; senderName: string; text: string } | null = null;
  let replyToUserId: string | null = null;
  if (body.replyToId && mongoose.isValidObjectId(body.replyToId)) {
    const orig = await ChatMessage.findOne({ _id: oid(body.replyToId), roomId: room._id, deletedAt: null }).select("senderId senderName text voice image sticker").lean();
    if (orig) {
      replyTo = { id: orig._id, senderName: orig.senderName, text: previewOf(orig).slice(0, 120) };
      replyToUserId = String(orig.senderId);
    }
  }
  const text = body.text ?? "";
  const msg = await ChatMessage.create({
    roomId: room._id,
    senderId: v.userId,
    senderName: v.fullName,
    senderRole: v.role,
    text,
    voice: body.voice ?? null,
    image: body.image ?? null,
    sticker: body.sticker && isSticker(body.sticker) ? body.sticker : null,
    replyTo,
  });
  const preview = previewOf(body).slice(0, 120);
  const first = v.fullName.split(" ")[0] || v.fullName;
  await ChatRoom.updateOne({ _id: room._id }, { $set: { lastMessageAt: msg.createdAt, lastMessage: { text: preview, senderName: first } } });
  // Yozgan odam suhbatni ko'rib turibdi; "yozmoqda" belgisi o'chadi
  await markRead(room._id, v.userId, String(msg._id));
  await ChatTyping.deleteOne({ roomId: room._id, userId: oid(v.userId) });

  const targets = await chatNotifyTargets(room, v.userId, { replyToUserId }).catch(() => ({ telegram: [] as string[], push: [] as string[] }));
  const roomTitle = room.kind === "custom" ? room.name ?? "" : "";
  if (targets.telegram.length > 0) {
    const { notifyMany } = await import("@/lib/notifications/notify");
    notifyMany(targets.telegram, "chat_message", { roomId: String(room._id), roomTitle, senderName: v.fullName, text: preview, voice: Boolean(body.voice) });
  }
  if (targets.push.length > 0) {
    const { sendPush } = await import("@/lib/push");
    void sendPush(targets.push, {
      title: roomTitle ? `${v.fullName} · ${roomTitle}` : v.fullName,
      body: preview || "Yangi xabar",
      url: `/chat?room=${room._id}`,
      tag: `chat-${room._id}`,
    });
  }
  return { ok: true, item: toItem(msg.toObject()) };
}

export interface ChatReader {
  userId: string;
  name: string;
  /** Shu xabargacha o'qigan */
  lastReadId: string;
}

/** Suhbatdagi o'qilgan joylar (✓✓ va "kim o'qidi" uchun) */
export async function roomReaders(roomId: Id, exceptUserId: string): Promise<ChatReader[]> {
  const reads = await ChatRead.find({ roomId: oid(roomId), userId: { $ne: oid(exceptUserId) } })
    .select("userId lastReadId")
    .sort({ lastReadId: -1 })
    .limit(300)
    .lean();
  const users = await User.find({ _id: { $in: reads.map((r) => r.userId) } }).select("fullName").lean();
  const name = new Map(users.map((u) => [String(u._id), u.fullName]));
  return reads.filter((r) => name.has(String(r.userId))).map((r) => ({ userId: String(r.userId), name: name.get(String(r.userId))!, lastReadId: String(r.lastReadId) }));
}

// ---- "... yozmoqda" ----

/** Shu vaqt ichida belgi qo'yganlar "yozmoqda" hisoblanadi (brauzer yozayotganda ~3 s da bir belgi yuboradi) */
const TYPING_FRESH_MS = 6000;

export async function setTyping(roomId: Id, v: ChatViewer, on: boolean) {
  if (!on) {
    await ChatTyping.deleteOne({ roomId: oid(roomId), userId: oid(v.userId) });
    return;
  }
  await ChatTyping.updateOne(
    { roomId: oid(roomId), userId: oid(v.userId) },
    { $set: { at: new Date(), name: v.fullName.split(" ")[0] || v.fullName } },
    { upsert: true }
  );
}

/** Hozir yozayotganlar (o'zidan tashqari) */
export async function typingIn(roomId: Id, exceptUserId: string): Promise<string[]> {
  const list = await ChatTyping.find({ roomId: oid(roomId), userId: { $ne: oid(exceptUserId) }, at: { $gt: new Date(Date.now() - TYPING_FRESH_MS) } })
    .select("name")
    .limit(5)
    .lean();
  return list.map((t) => t.name);
}
