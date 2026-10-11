import mongoose, { Schema, Document, Model } from "mongoose";

/** Butun platforma uchun yagona sozlamalar hujjati (key: "global") */
export interface IAppSettings extends Document {
  _id: mongoose.Types.ObjectId;
  key: string;
  /** Joriy o'quv yili, masalan "2026-2027" */
  academicYear?: string | null;
  /** Joriy chorak (1–4): darslar ro'yxatida va yangi dars yaratishda shu chorak tanlangan turadi */
  quarter?: number | null;
  /** Asosiy rang nomi — `ACCENTS` (src/lib/theme-accents.ts) */
  accent?: string | null;
  /** O'quvchilar o'z shaxsiy ma'lumotlarini (telefon, ota-ona, hujjatlar) o'zi kirita oladimi */
  studentProfileEdit?: boolean;
}

const AppSettingsSchema = new Schema<IAppSettings>(
  {
    key: { type: String, required: true, unique: true, default: "global" },
    academicYear: { type: String, default: null, trim: true },
    quarter: { type: Number, default: null, min: 1, max: 4 },
    accent: { type: String, default: null, trim: true },
    studentProfileEdit: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const AppSettings: Model<IAppSettings> =
  mongoose.models.AppSettings || mongoose.model<IAppSettings>("AppSettings", AppSettingsSchema);
