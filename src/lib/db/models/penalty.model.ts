import mongoose, { Schema, Document, Model } from "mongoose";

// Jarima: sababsiz dars qoldirish yoki muddatida topshirilmagan uyga vazifa.
// Coin balansi 0 bo'lsa ham yozuv saqlanadi — oydagi tartib (nechanchi marta) va o'quvchiga ko'rsatish shu yerdan olinadi.

export type PenaltyKind = "absence" | "homework";

export interface IPenaltyData {
  _id: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  kind: PenaltyKind;
  /** absence — davomat sessiyasi, homework — dars */
  refId: string | mongoose.Types.ObjectId;
  /** Toshkent bo'yicha oy: "2026-11" */
  monthKey: string;
  /** Shu oyda shu turdagi nechanchi jarima */
  no: number;
  /** Zinapoya bo'yicha olinishi kerak bo'lgan coin (musbat son) */
  wanted: number;
  /** Haqiqatda olingan coin (balans yetmasa kamroq) */
  applied: number;
  reason: string;
  /** O'quvchi saytda ko'rgan vaqt; null — hali ko'rsatilmagan */
  seenAt?: Date | string | null;
  createdAt?: Date | string;
}

export interface IPenalty extends Document, Omit<IPenaltyData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const PenaltySchema = new Schema<IPenalty>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["absence", "homework"], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    monthKey: { type: String, required: true },
    no: { type: Number, required: true, min: 1 },
    wanted: { type: Number, required: true, min: 0 },
    applied: { type: Number, default: 0, min: 0 },
    reason: { type: String, required: true, trim: true },
    seenAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Bitta dars/vazifa uchun bitta jarima
PenaltySchema.index({ kind: 1, refId: 1, studentId: 1 }, { unique: true });
PenaltySchema.index({ studentId: 1, kind: 1, monthKey: 1 });
PenaltySchema.index({ studentId: 1, seenAt: 1, createdAt: -1 });

export const Penalty: Model<IPenalty> = mongoose.models.Penalty || mongoose.model<IPenalty>("Penalty", PenaltySchema);
