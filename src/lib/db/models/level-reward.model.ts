import mongoose, { Schema, Document, Model } from "mongoose";

/** Har bir daraja bonusi o'quvchiga faqat bir marta beriladi: (o'quvchi, daraja) yagona */
export interface ILevelReward extends Document {
  _id: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  level: number;
  coins: number;
  createdAt?: Date;
}

const LevelRewardSchema = new Schema<ILevelReward>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    level: { type: Number, required: true, min: 1 },
    coins: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LevelRewardSchema.index({ studentId: 1, level: 1 }, { unique: true });

export const LevelReward: Model<ILevelReward> =
  mongoose.models.LevelReward || mongoose.model<ILevelReward>("LevelReward", LevelRewardSchema);
