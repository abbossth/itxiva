import { StudentProfile } from "@/lib/db/models/student-profile.model";
import { decryptField } from "@/lib/field-crypto";
import type { OwnProfileInput } from "@/lib/validations/student-profile.schema";

// O'quvchining shaxsiy ma'lumotlarini bazadan forma ko'rinishiga o'tkazish. Server action fayli ("use server")
// tashqarisida turadi: undan eksport qilingan har bir funksiya brauzerdan chaqiriladigan amalga aylanib qoladi.

const toKey = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const loadProfile = (studentId: string) => StudentProfile.findOne({ studentId }).lean();
type ProfileLean = Awaited<ReturnType<typeof loadProfile>>;

/** Bazadagi hujjatdan forma qiymatlari (mentor izohisiz) */
export function toOwnData(profile: ProfileLean): OwnProfileInput {
  return {
    birthDate: toKey(profile?.birthDate),
    gender: profile?.gender ?? "",
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
    school: profile?.school ?? "",
    fatherName: profile?.fatherName ?? "",
    fatherPhone: profile?.fatherPhone ?? "",
    motherName: profile?.motherName ?? "",
    motherPhone: profile?.motherPhone ?? "",
    documentType: profile?.documentType ?? "",
    birthCertNumber: decryptField(profile?.birthCertNumberEnc),
    birthCertIssuedAt: toKey(profile?.birthCertIssuedAt),
    birthCertIssuedBy: profile?.birthCertIssuedBy ?? "",
    passportNumber: decryptField(profile?.passportNumberEnc),
    passportIssuedAt: toKey(profile?.passportIssuedAt),
    passportExpiresAt: toKey(profile?.passportExpiresAt),
    passportIssuedBy: profile?.passportIssuedBy ?? "",
    pinfl: decryptField(profile?.pinflEnc),
  };
}
