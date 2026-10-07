import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPreviousToken {
  token: string;
  code: string;
  expiredAt: Date;
}

export interface IAttendanceSessionData {
  _id: string | mongoose.Types.ObjectId;
  groupId: string | mongoose.Types.ObjectId;
  mentorId: string | mongoose.Types.ObjectId;
  date: Date | string;
  startTime: Date | string;
  endTime?: Date | string | null;
  status: "active" | "closed";
  currentCode: string;
  currentToken: string;
  codeRotatedAt: Date | string;
  rotateIntervalSeconds: number;
  previousTokens: IPreviousToken[];
  defaultCoinsReward: number;
  /** Shu dars uchun coin qoidasi (holat -> coin). Eski sessiyalarda yo'q */
  coinRules?: { present: number; late: number; excused: number; absent: number } | null;
  /** Kelmaganlarga jarima qo'llangan vaqt; null — hali yakunlanmagan */
  finalizedAt?: Date | string | null;
  /** QR'siz, mentor qo'lda kiritgan dars */
  isManual?: boolean;
  summary?: {
    totalPresent: number;
    totalLate: number;
    totalExcused: number;
    totalAbsent: number;
  };
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IAttendanceSession extends Document, Omit<IAttendanceSessionData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const AttendanceSessionSchema = new Schema<IAttendanceSession>(
  {
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    mentorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
      index: true,
    },
    currentCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    currentToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    codeRotatedAt: {
      type: Date,
      default: Date.now,
    },
    rotateIntervalSeconds: {
      type: Number,
      default: 180,
    },
    previousTokens: [
      {
        token: { type: String, required: true },
        code: { type: String, required: true },
        expiredAt: { type: Date, required: true },
      },
    ],
    defaultCoinsReward: {
      type: Number,
      default: 10,
    },
    coinRules: {
      type: new Schema(
        {
          present: { type: Number, required: true },
          late: { type: Number, required: true },
          excused: { type: Number, required: true },
          absent: { type: Number, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    isManual: {
      type: Boolean,
      default: false,
    },
    summary: {
      totalPresent: { type: Number, default: 0 },
      totalLate: { type: Number, default: 0 },
      totalExcused: { type: Number, default: 0 },
      totalAbsent: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

AttendanceSessionSchema.index({ groupId: 1, status: 1 });
// Hisobotlar va jurnal: davr bo'yicha yopilgan darslar
AttendanceSessionSchema.index({ status: 1, date: 1 });
// Bir guruhning bir kundagi darsini topish (dublikat ochilmasligi uchun tekshiruv)
AttendanceSessionSchema.index({ groupId: 1, date: 1 });

export const AttendanceSession: Model<IAttendanceSession> =
  mongoose.models.AttendanceSession ||
  mongoose.model<IAttendanceSession>("AttendanceSession", AttendanceSessionSchema);
