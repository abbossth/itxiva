import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * item — oddiy sovg'a; privilege — imtiyoz (material bo'lmagan mukofot: mentor bilan 1:1, loyihani proyektorda ko'rsatish);
 * streak_shield — seriya himoyasi (gamifikatsiya): xarid qilinishi bilan beriladi, mentor tasdig'i kerak emas
 */
export type ProductKind = "item" | "privilege" | "streak_shield";

export interface IProductData {
  _id: string | mongoose.Types.ObjectId;
  title: string;
  description?: string;
  price: number;
  /** Hayotdagi narxi (so'm) — faqat mentor ko'radi, coin narxini tavsiya qilish uchun. O'quvchiga yuborilmaydi */
  realPrice?: number | null;
  /** Vaqtinchalik chegirma: shu narx `saleEndsAt` gacha amal qiladi (src/lib/shop-sale.ts) */
  salePrice?: number | null;
  saleEndsAt?: Date | string | null;
  category?: string;
  /** Do'kondagi tartib (kichigi tepada). Mentor hech qachon tartiblamagan bo'lsa — null, narx bo'yicha */
  sortOrder?: number | null;
  kind?: ProductKind;
  imageKey?: string | null;
  /** null — cheklanmagan */
  stock: number | null;
  isActive: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IProduct extends Document, Omit<IProductData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const ProductSchema = new Schema<IProduct>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    price: { type: Number, required: true, min: 1 },
    realPrice: { type: Number, default: null, min: 0 },
    salePrice: { type: Number, default: null, min: 1 },
    saleEndsAt: { type: Date, default: null },
    category: { type: String, trim: true, default: "" },
    sortOrder: { type: Number, default: null },
    kind: { type: String, enum: ["item", "privilege", "streak_shield"], default: "item" },
    imageKey: { type: String, default: null },
    stock: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", ProductSchema);
