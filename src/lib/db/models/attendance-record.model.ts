import mongoose, { Schema, Document, Model } from "mongoose";

export type AttendanceStatus = "present" | "late" | "excused" | "absent";
export type AttendanceMethod = "qr" | "code" | "manual";

export interface IAttendanceRecordData {
  _id: string | mongoose.Types.ObjectId;
  sessionId: string | mongoose.Types.ObjectId;
  studentId: string | mongoose.Types.ObjectId;
  groupId: string | mongoose.Types.ObjectId;
  status: AttendanceStatus;
  method: AttendanceMethod;
  markedAt: Date | string;
  /** Shu yozuvning reytingga (totalCoins) haqiqiy ta'siri; jarimada manfiy */
  coinsAwarded: number;
  /** Do'kon balansiga (spendableBalance) haqiqiy ta'siri. Eski yozuvlarda yo'q — coinsAwarded ga teng deb olinadi */
  balanceDelta?: number | null;
  notes?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IAttendanceRecord extends Document, Omit<IAttendanceRecordData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const AttendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: true,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["present", "late", "excused", "absent"],
      default: "present",
      required: true,
    },
    method: {
      type: String,
      enum: ["qr", "code", "manual"],
      default: "qr",
      required: true,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    coinsAwarded: {
      type: Number,
      default: 0,
    },
    balanceDelta: {
      type: Number,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// One record per student per attendance session
AttendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
AttendanceRecordSchema.index({ studentId: 1, createdAt: -1 });

export const AttendanceRecord: Model<IAttendanceRecord> =
  mongoose.models.AttendanceRecord ||
  mongoose.model<IAttendanceRecord>("AttendanceRecord", AttendanceRecordSchema);
