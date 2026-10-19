import mongoose, { Schema, Document, Model } from "mongoose";

// O'quvchining shaxsiy ma'lumotlari User hujjatidan ALOHIDA saqlanadi: User ro'yxatlari (reyting, guruh,
// hisobotlar) ko'p joyda o'qiladi va bu maydonlar ularga tasodifan qo'shilib ketmasligi kerak.
// Faqat mentor ko'radi va tahrirlaydi. Hujjat raqamlari (…Enc) AES-256-GCM bilan shifrlangan holda yoziladi.

export type Gender = "male" | "female";

export interface IStudentProfile extends Document {
  _id: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  /** Ombordagi rasm kaliti: avatars/{studentId}/... */
  photoKey?: string | null;
  birthDate?: Date | null;
  gender?: Gender | null;
  phone?: string;
  address?: string;
  school?: string;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  motherPhone?: string;
  /** Qaysi hujjati bor (profil to'liqligi shu hujjat bo'yicha hisoblanadi); null — tanlanmagan */
  documentType?: "birthCert" | "passport" | null;
  /** Tug'ilganlik haqidagi guvohnoma */
  birthCertNumberEnc?: string | null;
  birthCertIssuedAt?: Date | null;
  birthCertIssuedBy?: string;
  /** Pasport yoki ID-karta */
  passportNumberEnc?: string | null;
  passportIssuedAt?: Date | null;
  passportExpiresAt?: Date | null;
  passportIssuedBy?: string;
  /** JSHSHIR (PINFL) */
  pinflEnc?: string | null;
  notes?: string;
  updatedAt?: Date;
}

const text = { type: String, default: "", trim: true };

const StudentProfileSchema = new Schema<IStudentProfile>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    photoKey: { type: String, default: null },
    birthDate: { type: Date, default: null },
    gender: { type: String, enum: ["male", "female", null], default: null },
    phone: text,
    address: text,
    school: text,
    fatherName: text,
    fatherPhone: text,
    motherName: text,
    motherPhone: text,
    documentType: { type: String, enum: ["birthCert", "passport", null], default: null },
    birthCertNumberEnc: { type: String, default: null },
    birthCertIssuedAt: { type: Date, default: null },
    birthCertIssuedBy: text,
    passportNumberEnc: { type: String, default: null },
    passportIssuedAt: { type: Date, default: null },
    passportExpiresAt: { type: Date, default: null },
    passportIssuedBy: text,
    pinflEnc: { type: String, default: null },
    notes: text,
  },
  { timestamps: true }
);

export const StudentProfile: Model<IStudentProfile> =
  mongoose.models.StudentProfile || mongoose.model<IStudentProfile>("StudentProfile", StudentProfileSchema);
