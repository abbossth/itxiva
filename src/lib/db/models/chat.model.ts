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
    text: { type: String, required: true, maxlength: 2000 },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
ChatMessageSchema.index({ roomId: 1, _id: -1 });
/** Xabarlar 7 kundan keyin avtomatik o'chadi (MongoDB TTL — baza o'zi, taxminan bir daqiqa ichida o'chiradi) */
export const CHAT_MESSAGE_TTL_DAYS = 7;
ChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: CHAT_MESSAGE_TTL_DAYS * 86_400 });

export interface IChatRead {
  userId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  /** Shu xabargacha (shu ham) o'qilgan */
  lastReadId: mongoose.Types.ObjectId;
}

const ChatReadSchema = new Schema<IChatRead>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },
  lastReadId: { type: Schema.Types.ObjectId, required: true },
});
ChatReadSchema.index({ userId: 1, roomId: 1 }, { unique: true });

export const ChatRoom: Model<IChatRoom> = mongoose.models.ChatRoom || mongoose.model<IChatRoom>("ChatRoom", ChatRoomSchema);
export const ChatMessage: Model<IChatMessage> = mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);
export const ChatRead: Model<IChatRead> = mongoose.models.ChatRead || mongoose.model<IChatRead>("ChatRead", ChatReadSchema);
