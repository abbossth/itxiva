import mongoose, { Schema, Model } from "mongoose";

// Brauzer push obunasi (Web Push): har bir qurilma/brauzer uchun bitta yozuv. Sayt yopiq bo'lsa ham xabar keladi.
export interface IPushSubscription {
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  /** Oxirgi muvaffaqiyatsiz yuborish (vaqtinchalik xatolarni kuzatish uchun) */
  failedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, maxlength: 1000 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 200 },
      auth: { type: String, required: true, maxlength: 100 },
    },
    userAgent: { type: String, maxlength: 300 },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

export const PushSubscription: Model<IPushSubscription> =
  mongoose.models.PushSubscription || mongoose.model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);
