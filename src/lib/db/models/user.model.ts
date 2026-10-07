import mongoose, { Schema, Document, Model } from "mongoose";

export type UserRole = "mentor" | "student";

export interface IUserData {
  _id: string | mongoose.Types.ObjectId;
  fullName: string;
  login: string;
  role: UserRole;
  groupId?: string | mongoose.Types.ObjectId | null;
  mustChangePassword?: boolean;
  totalCoins?: number;
  spendableBalance?: number;
  isHiddenFromLeaderboard?: boolean;
  lastLoginAt?: Date | string | null;
  /** Telegram bot ulangan bo'lsa — chat ma'lumotlari */
  telegram?: { chatId: string | null; username?: string | null; linkedAt?: Date | string | null } | null;
  /** Bildirishnoma turlari: false — o'chirilgan; yozilmagan tur yoqilgan hisoblanadi */
  notificationPrefs?: Record<string, boolean> | null;
  /** Reytingdagi salyut (konfetti, ovoz, titrash). Yozilmagan bo'lsa — yoqilgan */
  celebrationsEnabled?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IUser extends Document, Omit<IUserData, "_id"> {
  _id: mongoose.Types.ObjectId;
  passwordHash: string;
  tempPasswordEnc?: string | null;
  /** Telegram'ni ulash uchun bir martalik token (faqat xeshi saqlanadi) */
  telegramLink?: { tokenHash: string; expiresAt: Date } | null;
}

const UserSchema = new Schema<IUser>(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    login: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    // Mentor bergan vaqtinchalik parol (shifrlangan). O'quvchi parolini o'zgartirganda o'chiriladi.
    tempPasswordEnc: {
      type: String,
      default: null,
      select: false,
    },
    role: {
      type: String,
      enum: ["mentor", "student"],
      default: "student",
      required: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    totalCoins: {
      type: Number,
      default: 0,
      index: true,
    },
    spendableBalance: {
      type: Number,
      default: 0,
    },
    isHiddenFromLeaderboard: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    telegram: {
      chatId: { type: String, default: null },
      username: { type: String, default: null },
      linkedAt: { type: Date, default: null },
    },
    telegramLink: {
      type: new Schema({ tokenHash: { type: String, required: true }, expiresAt: { type: Date, required: true } }, { _id: false }),
      default: null,
      select: false,
    },
    notificationPrefs: { type: Schema.Types.Mixed, default: () => ({}) },
    celebrationsEnabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ role: 1, isHiddenFromLeaderboard: 1, totalCoins: -1 });
// Bitta Telegram chat faqat bitta hisobga ulanadi; ulanmaganlar (null) indeksga kirmaydi
UserSchema.index({ "telegram.chatId": 1 }, { unique: true, partialFilterExpression: { "telegram.chatId": { $type: "string" } } });
UserSchema.index({ "telegramLink.tokenHash": 1 }, { sparse: true });
UserSchema.index({ groupId: 1, role: 1, isHiddenFromLeaderboard: 1, totalCoins: -1 });

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
