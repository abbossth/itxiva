import mongoose, { Schema, Model } from "mongoose";

// Chat: umumiy (hamma uchun bitta), o'quv guruhi chati (guruh o'quvchilari + mentorlar), o'quvchilar yaratgan guruhlar
// (a'zolar ro'yxati bilan) va shaxsiy xabarlar (ikki kishi). Xabarlar alohida kolleksiyada, o'qilgan joy — ChatRead.

export type ChatRoomKind = "general" | "group" | "custom" | "dm";

export interface IChatRoom {
  _id: mongoose.Types.ObjectId;
  kind: ChatRoomKind;
  /** custom guruh nomi (general/group/dm uchun nom hisoblanadi) */
  name?: string;
  /** kind = "group": o'quv guruhi */
  groupId?: mongoose.Types.ObjectId | null;
  /** custom va dm: a'zolar (general va group'da — bo'sh, a'zolik avtomatik) */
  members: mongoose.Types.ObjectId[];
  /** custom: yaratgan o'quvchi (a'zo qo'shadi/chiqaradi, nomini o'zgartiradi) */
  ownerId?: mongoose.Types.ObjectId | null;
  /** custom: adminlar (a'zo qo'shadi/chiqaradi); egasi doim admin hisoblanadi */
  admins?: mongoose.Types.ObjectId[];
  /** custom: faqat egasi va adminlar yozadi (e'lonlar kanali kabi) */
  onlyAdmins?: boolean;
  /** dm: ikki foydalanuvchi id'si tartiblangan holda ("a:b") — bitta juftlik uchun bitta xona */
  dmKey?: string | null;
  lastMessageAt?: Date | null;
  lastMessage?: { text: string; senderName: string } | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const ChatRoomSchema = new Schema<IChatRoom>(
  {
    kind: { type: String, enum: ["general", "group", "custom", "dm"], required: true, index: true },
    name: { type: String, trim: true, maxlength: 60 },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    members: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    admins: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    onlyAdmins: { type: Boolean, default: false },
    dmKey: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
    lastMessage: { type: new Schema({ text: String, senderName: String }, { _id: false }), default: null },
  },
  { timestamps: true }
);
ChatRoomSchema.index({ members: 1, lastMessageAt: -1 });
ChatRoomSchema.index({ dmKey: 1 }, { unique: true, partialFilterExpression: { dmKey: { $type: "string" } } });
ChatRoomSchema.index({ kind: 1, groupId: 1 }, { unique: true, partialFilterExpression: { kind: { $in: ["general", "group"] } } });

export interface IChatMessage {
  _id: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  senderRole: "mentor" | "student";
  text: string;
  /** Ovozli xabar: R2 kaliti, turi, davomiyligi (soniya) va hajmi */
  voice?: { key: string; mime: string; duration: number; size: number } | null;
  /** Rasm: R2 kaliti, turi, o'lchamlari va hajmi */
  image?: { key: string; mime: string; width: number; height: number; size: number } | null;
  /** Stiker (STICKER_PACKS dagi kod) */
  sticker?: string | null;
  /** Javob berilgan xabar (iqtibos) */
  replyTo?: { id: mongoose.Types.ObjectId; senderName: string; text: string } | null;
  /** Reaksiyalar: emoji va kim qo'ygani (bir odam — bitta reaksiya) */
  reactions?: { emoji: string; userId: mongoose.Types.ObjectId }[];
  /** Reaksiya yoki o'chirish bo'lgan vaqt: brauzer shundan keyingi o'zgarishlarni so'raydi */
  changedAt?: Date | null;
  /** O'chirilgan xabar: matni ko'rsatilmaydi */
  deletedAt?: Date | null;
  deletedBy?: mongoose.Types.ObjectId | null;
  createdAt?: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, enum: ["mentor", "student"], required: true },
    text: { type: String, default: "", maxlength: 2000 },
    voice: { type: new Schema({ key: String, mime: String, duration: Number, size: Number }, { _id: false }), default: null },
    image: { type: new Schema({ key: String, mime: String, width: Number, height: Number, size: Number }, { _id: false }), default: null },
    sticker: { type: String, default: null },
    replyTo: { type: new Schema({ id: Schema.Types.ObjectId, senderName: String, text: String }, { _id: false }), default: null },
    reactions: { type: [new Schema({ emoji: String, userId: Schema.Types.ObjectId }, { _id: false })], default: [] },
    changedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ChatMessageSchema.index({ roomId: 1, _id: -1 });
ChatMessageSchema.index({ roomId: 1, changedAt: 1 }, { partialFilterExpression: { changedAt: { $type: "date" } } });
/** Xabarlar 7 kundan keyin avtomatik o'chadi (MongoDB TTL — baza o'zi, taxminan bir daqiqa ichida o'chiradi) */
export const CHAT_MESSAGE_TTL_DAYS = 7;
ChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: CHAT_MESSAGE_TTL_DAYS * 86_400 });

export interface IChatRead {
  userId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  /** Shu xabargacha (shu ham) o'qilgan */
  lastReadId: mongoose.Types.ObjectId;
  /** Foydalanuvchi shu suhbatni oxirgi marta ochib turgan vaqt (ochiq turganda Telegram xabari yuborilmaydi) */
  seenAt?: Date | null;
  /** Shu suhbat bo'yicha oxirgi Telegram xabari (10 daqiqada ko'pi bilan bittasi) */
  notifiedAt?: Date | null;
  /** Suhbat ovozsiz: push, Telegram va sahifadagi xabarnoma kelmaydi, menyu nishonida sanalmaydi */
  muted?: boolean;
}

const ChatReadSchema = new Schema<IChatRead>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },
  lastReadId: { type: Schema.Types.ObjectId, required: true },
  seenAt: { type: Date, default: null },
  notifiedAt: { type: Date, default: null },
  muted: { type: Boolean, default: false },
});
ChatReadSchema.index({ userId: 1, roomId: 1 }, { unique: true });
// "Kim o'qidi" — suhbat bo'yicha
ChatReadSchema.index({ roomId: 1, lastReadId: -1 });

export const ChatRoom: Model<IChatRoom> = mongoose.models.ChatRoom || mongoose.model<IChatRoom>("ChatRoom", ChatRoomSchema);
export const ChatMessage: Model<IChatMessage> = mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
export const ChatRead: Model<IChatRead> = mongoose.models.ChatRead || mongoose.model<IChatRead>("ChatRead", ChatReadSchema);

/** "... yozmoqda": har bir foydalanuvchi uchun suhbatda bitta yozuv, bir necha soniya amal qiladi */
export interface IChatTyping {
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  at: Date;
}
const ChatTypingSchema = new Schema<IChatTyping>({
  roomId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  at: { type: Date, required: true },
});
ChatTypingSchema.index({ roomId: 1, userId: 1 }, { unique: true });
// Eski yozuvlarni baza o'zi tozalaydi (so'rovda baribir oxirgi soniyalar olinadi)
ChatTypingSchema.index({ at: 1 }, { expireAfterSeconds: 120 });
export const ChatTyping: Model<IChatTyping> = mongoose.models.ChatTyping || mongoose.model<IChatTyping>("ChatTyping", ChatTypingSchema);
