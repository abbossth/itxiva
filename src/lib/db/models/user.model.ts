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
  /** Mentor chatda yozishni shu vaqtgacha taqiqlagan (o'qish mumkin) */
  chatMutedUntil?: Date | string | null;
  /** Chatda bloklagan odamlari: ular shaxsiy xabar yoza olmaydi va bu foydalanuvchini guruhga qo'sha olmaydi */
  chatBlocked?: (string | mongoose.Types.ObjectId)[];
  /** Mukofot tabrigi ko'rsatilgan oxirgi coin/XP yozuvi vaqti; null — hali boshlanmagan */
  rewardsSeenAt?: Date | null;
  /** Tajriba: hech qachon sarflanmaydi; daraja va reyting shu bo'yicha (gamifikatsiya) */
  xp?: number;
  /** Joriy daraja (1–10). Daraja bonusi berilganini LevelReward saqlaydi */
  level?: number;
  /** Yangi daraja: o'quvchi keyingi kirishida tabrik oynasi bir marta ko'rsatiladi */
  pendingLevelUp?: number | null;
  /** O'quvchi personaji: ko'rinishi, sotib olingan qismlar ("slot:id") va kuch darajasi */
  character?: { look?: Record<string, unknown> | null; owned?: string[]; power?: number; updatedAt?: Date | null } | null;
  /** Ko'rilgan "Yangilik" e'lonlari (id) */
  seenNews?: string[];
  /** O'yin kuchaytirgichlari zaxirasi: tur → soni */
  boosters?: { fifty?: number; double?: number; guard?: number } | null;
  /** Kirish seriyasi (Asia/Tashkent kunlari bo'yicha) */
  streak?: { current: number; best: number; lastDayKey: string | null } | null;
  /** Seriya himoyasi: o'tkazib yuborilgan bir kunni avtomatik yopadi */
  streakShields?: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IUser extends Document, Omit<IUserData, "_id"> {
  _id: mongoose.Types.ObjectId;
  passwordHash: string;
  tempPasswordEnc?: string | null;
  /** Parol o'zgarganda yoki tiklanganda oshadi — eski sessiya cookie'lari shu bilan yaroqsiz bo'ladi */
  sessionVersion?: number;
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
    sessionVersion: {
      type: Number,
      default: 0,
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
    chatMutedUntil: { type: Date, default: null },
    chatBlocked: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    rewardsSeenAt: { type: Date, default: null },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    pendingLevelUp: { type: Number, default: null },
    character: {
      type: new Schema(
        {
          look: { type: Schema.Types.Mixed, default: null },
          owned: { type: [String], default: [] },
          power: { type: Number, default: 0, min: 0 },
          updatedAt: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    seenNews: { type: [String], default: [] },
    boosters: {
      type: new Schema({ fifty: { type: Number, default: 0, min: 0 }, double: { type: Number, default: 0, min: 0 }, guard: { type: Number, default: 0, min: 0 } }, { _id: false }),
      default: null,
    },
    streak: {
      current: { type: Number, default: 0 },
      best: { type: Number, default: 0 },
      lastDayKey: { type: String, default: null },
    },
    streakShields: { type: Number, default: 0, min: 0 },
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
UserSchema.index({ role: 1, isHiddenFromLeaderboard: 1, xp: -1 });

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
