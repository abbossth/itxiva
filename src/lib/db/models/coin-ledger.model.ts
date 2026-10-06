import mongoose, { Schema, Document, Model } from "mongoose";

export type CoinTransactionType =
  | "attendance"
  | "quiz"
  | "exam"
  | "homework"
  | "bonus"
  | "purchase"
  | "adjustment";

export interface ICoinLedgerData {
  _id: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  amount: number;
  type: CoinTransactionType;
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
      enum: ["attendance", "quiz", "exam", "homework", "bonus", "purchase", "adjustment"],
      required: true,
      index: true,
    },
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

export const CoinLedger: Model<ICoinLedger> =
  mongoose.models.CoinLedger ||
  mongoose.model<ICoinLedger>("CoinLedger", CoinLedgerSchema);
