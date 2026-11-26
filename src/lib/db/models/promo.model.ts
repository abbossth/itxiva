import mongoose, { Schema, Model } from "mongoose";

// O'quvchining bosh sahifadagi pullik e'loni (do'kon orqali). Ustoz tasdiqlagach startsAt..endsAt oralig'ida ko'rinadi.
export interface IPromo {
  _id: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  kind: "announce" | "me" | "project";
  title: string;
  text: string;
  link?: string | null;
  emoji: string;
  color: string;
  days: number;
  price: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  startsAt?: Date | null;
  endsAt?: Date | null;
  reviewedBy?: mongoose.Types.ObjectId | null;
  note?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const PromoSchema = new Schema<IPromo>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["announce", "me", "project"], required: true },
    title: { type: String, required: true, maxlength: 60 },
    text: { type: String, default: "", maxlength: 200 },
    link: { type: String, default: null, maxlength: 300 },
    emoji: { type: String, default: "📣", maxlength: 8 },
    color: { type: String, default: "teal", maxlength: 12 },
    days: { type: Number, required: true, min: 1, max: 3 },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending", index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true }
);
PromoSchema.index({ status: 1, endsAt: 1 });

export const Promo: Model<IPromo> = mongoose.models.Promo || mongoose.model<IPromo>("Promo", PromoSchema);
