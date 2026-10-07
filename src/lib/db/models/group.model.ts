import mongoose, { Schema, Document, Model } from "mongoose";
import type { GroupSchedule } from "@/lib/schedule";

export interface IGroupData {
  _id: string | mongoose.Types.ObjectId;
  name: string;
  /** Qisqa nom ("8.2"). Bo'sh bo'lsa nomdan avtomatik chiqariladi — `groupShortName` */
  shortName?: string | null;
  grade: number;
  academicYear: string;
  studentCount: number;
  isActive: boolean;
  schedule?: GroupSchedule | null;
  /** Dars eslatmasi yuborilgan oxirgi kun ("YYYY-MM-DD", Toshkent) — bir kunda ikki marta ketmasligi uchun */
  lessonReminderSentFor?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IGroup extends Document, Omit<IGroupData, "_id"> {
  _id: mongoose.Types.ObjectId;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    shortName: {
      type: String,
      trim: true,
      maxlength: 12,
      default: "",
    },
    grade: {
      type: Number,
      required: true,
      enum: [8, 9, 10, 11],
    },
    academicYear: {
      type: String,
      required: true,
      default: "2026-2027",
    },
    studentCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Dars jadvali: days — ISO hafta kunlari (1 = Dushanba), vaqtlar "HH:MM" (Asia/Tashkent)
    schedule: {
      type: new Schema(
        {
          days: { type: [Number], default: [] },
          startTime: { type: String, required: true },
          endTime: { type: String, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    lessonReminderSentFor: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

GroupSchema.index({ grade: 1, isActive: 1 });

export const Group: Model<IGroup> =
  mongoose.models.Group || mongoose.model<IGroup>("Group", GroupSchema);
