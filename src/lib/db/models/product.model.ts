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
  category?: string;
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
    category: { type: String, trim: true, default: "" },
    kind: { type: String, enum: ["item", "privilege", "streak_shield"], default: "item" },
    imageKey: { type: String, default: null },
    stock: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", ProductSchema);
