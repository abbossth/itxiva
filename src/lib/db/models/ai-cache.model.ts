import mongoose, { Schema, Model } from "mongoose";

/**
 * AI natijalari keshi va modellarning kutish vaqti. Bepul tarifda kunlik so'rovlar soni cheklangan:
 * bir xil matn yoki javob qayta tekshirilganda AI yana chaqirilmaydi. Muddati o'tgan yozuvni MongoDB o'zi o'chiradi.
 */
export interface IAiCache {
  key: string;
  value: unknown;
  expiresAt: Date;
}

const AiCacheSchema = new Schema<IAiCache>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export const AiCache: Model<IAiCache> = mongoose.models.AiCache || mongoose.model<IAiCache>("AiCache", AiCacheSchema);
