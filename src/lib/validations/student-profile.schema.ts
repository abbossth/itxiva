import { z } from "zod";

const text = (max: number) => z.string().trim().max(max).default("");
// Sana: "YYYY-MM-DD" yoki bo'sh
const dateKey = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())), "Sana noto'g'ri")
  .default("");
const phone = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || /^\+?[\d\s()-]{7,20}$/.test(v), "Telefon raqami noto'g'ri")
  .default("");

export const studentProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Ism-familiya kamida 2 ta belgi").max(80),
  birthDate: dateKey,
  gender: z.enum(["male", "female", ""]).default(""),
  phone,
  address: text(200),
  school: text(120),
  fatherName: text(80),
  fatherPhone: phone,
  motherName: text(80),
  motherPhone: phone,
  /** Qaysi hujjati bor: tug'ilganlik guvohnomasi yoki pasport/ID-karta (bo'sh — tanlanmagan) */
  documentType: z.enum(["birthCert", "passport", ""]).default(""),
  birthCertNumber: text(30),
  birthCertIssuedAt: dateKey,
  birthCertIssuedBy: text(160),
  passportNumber: text(20),
  passportIssuedAt: dateKey,
  passportExpiresAt: dateKey,
  passportIssuedBy: text(160),
  pinfl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{14}$/.test(v), "JSHSHIR 14 ta raqamdan iborat bo'ladi")
    .default(""),
  notes: text(2000),
});

export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

/** O'quvchi o'zi kirita oladigan maydonlar: ism-familiya va mentor izohi bunga kirmaydi */
export const ownProfileSchema = studentProfileSchema.omit({ fullName: true, notes: true });
export type OwnProfileInput = z.infer<typeof ownProfileSchema>;
