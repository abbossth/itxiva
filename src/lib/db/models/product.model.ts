import mongoose, { Schema, Document, Model } from "mongoose";

export interface IProductData {
  _id: string | mongoose.Types.ObjectId;
  title: string;
  description?: string;
  price: number;
  category?: string;
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
    imageKey: { type: String, default: null },
    stock: { type: Number, default: null, min: 0 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>("Product", ProductSchema);
