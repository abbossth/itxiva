import mongoose, { Schema, Model } from "mongoose";

/**
 * Urinishlar hisoblagichi. Xotiradagi hisoblagich (lib/rate-limit.ts) server nusxalari orasida
 * bo'linmaydi va qayta ishga tushganda yo'qoladi — kirish va parol kabi muhim joylarda shu ishlatiladi.
 */
export interface IRateLimit {
  key: string;
  count: number;
  resetAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  // Muddati o'tgan yozuvlarni MongoDB o'zi o'chiradi
  resetAt: { type: Date, required: true, index: { expires: 0 } },
});

export const RateLimit: Model<IRateLimit> =
  mongoose.models.RateLimit || mongoose.model<IRateLimit>("RateLimit", RateLimitSchema);
