import mongoose, { Schema, Document, Model } from "mongoose";
import type { BadgeId, BadgeTier } from "@/lib/gamification/badges";

/** Olingan nishon bosqichi: (o'quvchi, nishon, bosqich) yagona — mukofot bir marta */
export interface IStudentBadge extends Document {
  _id: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  badge: BadgeId;
  tier: BadgeTier;
  coins: number;
  createdAt?: Date;
}

const StudentBadgeSchema = new Schema<IStudentBadge>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    badge: { type: String, required: true },
    tier: { type: String, enum: ["bronze", "silver", "gold"], required: true },
    coins: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

StudentBadgeSchema.index({ studentId: 1, badge: 1, tier: 1 }, { unique: true });

export const StudentBadge: Model<IStudentBadge> =
  mongoose.models.StudentBadge || mongoose.model<IStudentBadge>("StudentBadge", StudentBadgeSchema);
