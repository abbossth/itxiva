import mongoose, { Schema, Document, Model } from "mongoose";
import { CHEAT_KINDS, type CheatContext, type CheatCounts } from "@/lib/anti-cheat/kinds";

// Anti-cheat: o'quvchining bitta test/imtihon/jonli o'yindagi qoidabuzarliklari (tur bo'yicha sanoq)

export interface ICheatEventData {
  _id: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  context: CheatContext;
  /** Test, imtihon yoki jonli o'yin id */
  refId: string;
  counts: CheatCounts;
  total: number;
  lastAt: Date | string;
  createdAt?: Date | string;
}

export interface ICheatEvent extends Document, Omit<ICheatEventData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const CheatEventSchema = new Schema<ICheatEvent>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    context: { type: String, enum: ["quiz", "exam", "live"], required: true },
    refId: { type: String, required: true },
    counts: new Schema(Object.fromEntries(CHEAT_KINDS.map((k) => [k, { type: Number, default: 0 }])), { _id: false }),
    total: { type: Number, default: 0 },
    lastAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CheatEventSchema.index({ studentId: 1, context: 1, refId: 1 }, { unique: true });
CheatEventSchema.index({ context: 1, refId: 1 });

export const CheatEvent: Model<ICheatEvent> =
  (mongoose.models.CheatEvent as Model<ICheatEvent>) || mongoose.model<ICheatEvent>("CheatEvent", CheatEventSchema);
