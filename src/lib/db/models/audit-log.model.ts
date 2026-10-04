import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAuditLog extends Document {
  _id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: string;
  targetUserId?: mongoose.Types.ObjectId | null;
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ip: {
      type: String,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);
