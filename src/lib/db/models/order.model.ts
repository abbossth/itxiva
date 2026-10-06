import mongoose, { Schema, Document, Model } from "mongoose";

// pending: o'quvchi buyurtma berdi (coin yechilgan) -> accepted: mentor qabul qildi ->
// handed_over: mentor sovg'ani topshirdi -> received: o'quvchi "Qabul qildim" dedi.
// rejected (mentor) va cancelled (o'quvchi) holatlarida coin qaytariladi.
export type OrderStatus = "pending" | "accepted" | "handed_over" | "received" | "rejected" | "cancelled";

export interface IOrderData {
  _id: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  groupId?: string | mongoose.Types.ObjectId | null;
  productId: string | mongoose.Types.ObjectId;
  productTitle: string;
  price: number;
  status: OrderStatus;
  mentorNote?: string;
  acceptedAt?: Date | string | null;
  handedOverAt?: Date | string | null;
  receivedAt?: Date | string | null;
  closedAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IOrder extends Document, Omit<IOrderData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const OrderSchema = new Schema<IOrder>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: "Group", default: null },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    // Mahsulot keyin o'zgarsa ham buyurtma paytidagi nom va narx saqlanib qoladi
    productTitle: { type: String, required: true },
    price: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "handed_over", "received", "rejected", "cancelled"],
      default: "pending",
      index: true,
    },
    mentorNote: { type: String, trim: true, default: "" },
    acceptedAt: { type: Date, default: null },
    handedOverAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

OrderSchema.index({ studentId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

export const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
