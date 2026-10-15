import mongoose, { Schema, Document, Model } from "mongoose";

export type CoinTransactionType =
  | "attendance"
  | "quiz"
  | "exam"
  | "homework"
  | "bonus"
  | "purchase"
  | "adjustment"
  // Gamifikatsiya
  | "quest"
  | "level"
  | "login"
  | "streak"
  | "badge"
  | "challenge";

export const COIN_TRANSACTION_TYPES: CoinTransactionType[] = [
  "attendance",
  "quiz",
  "exam",
  "homework",
  "bonus",
  "purchase",
  "adjustment",
  "quest",
  "level",
  "login",
  "streak",
  "badge",
  "challenge",
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
  createdAt?: Date | string;
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
