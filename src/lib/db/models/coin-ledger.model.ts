import mongoose, { Schema, Document, Model } from "mongoose";

export type CoinTransactionType =
  | "attendance"
  | "quiz"
  | "exam"
  | "homework"
  | "bonus"
  | "purchase"
  | "adjustment"
  // Sababsiz dars qoldirish va topshirilmagan uyga vazifa uchun jarima (zinapoya: −10 / −30 / −50)
  | "penalty"
  // Gamifikatsiya
  | "quest"
  | "level"
  | "login"
  | "streak"
  | "badge"
  | "challenge"
  // XP ni eski reytingga (totalCoins) tenglashtirish: coin 0, faqat xp. Haftalik hisoblarga kirmaydi
  | "xp_align";

export const COIN_TRANSACTION_TYPES: CoinTransactionType[] = [
  "attendance",
  "quiz",
  "exam",
  "homework",
  "bonus",
  "purchase",
  "adjustment",
  "penalty",
  "quest",
  "level",
  "login",
  "streak",
  "badge",
  "challenge",
  "xp_align",
];

export interface ICoinLedgerData {
  _id: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  /** Coin (balans) o'zgarishi */
  amount: number;
  /** XP o'zgarishi: mukofotda odatda coin bilan teng, xaridda 0. Gamifikatsiyadan oldingi yozuvlarda yo'q */
  xp?: number;
  type: CoinTransactionType;
  /** Bir xil mukofot ikki marta yozilmasligi uchun (masalan "quest:<submissionId>") */
  idempotencyKey?: string | null;
  referenceId?: string | mongoose.Types.ObjectId | null;
  description: string;
  balanceAfter?: number;
  /** Mentor tuzatishlari: summa o'zgartirilgan yoki bekor qilingan (yozuv o'chirilmaydi — mukofot qayta berilmasin) */
  edits?: ICoinLedgerEdit[];
  /** Mentor bekor qilgan (coin va XP 0 ga tushirilgan) */
  voidedAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface ICoinLedgerEdit {
  at: Date | string;
  by: string | mongoose.Types.ObjectId;
  fromCoin: number;
  fromXp: number;
  toCoin: number;
  toXp: number;
  reason: string;
}

export interface ICoinLedger extends Document, Omit<ICoinLedgerData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const CoinLedgerSchema = new Schema<ICoinLedger>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: COIN_TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    xp: { type: Number, default: 0 },
    idempotencyKey: { type: String, default: undefined },
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    balanceAfter: {
      type: Number,
    },
    edits: {
      type: [
        new Schema(
          {
            at: { type: Date, default: Date.now },
            by: { type: Schema.Types.ObjectId, ref: "User" },
            fromCoin: Number,
            fromXp: Number,
            toCoin: Number,
            toXp: Number,
            reason: { type: String, default: "" },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    voidedAt: { type: Date, default: undefined },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

CoinLedgerSchema.index({ studentId: 1, createdAt: -1 });
// Faqat kaliti bor yozuvlar indeksga kiradi: eski yozuvlar va kalitsiz amallar bunga ta'sir qilmaydi
CoinLedgerSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);
CoinLedgerSchema.index({ type: 1, createdAt: -1 });

export const CoinLedger: Model<ICoinLedger> =
  mongoose.models.CoinLedger ||
  mongoose.model<ICoinLedger>("CoinLedger", CoinLedgerSchema);
