"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { StudentProfile, type Gender } from "@/lib/db/models/student-profile.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { decryptField, encryptField } from "@/lib/field-crypto";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import { studentProfileSchema, type StudentProfileInput } from "@/lib/validations/student-profile.schema";
import { getStudentReport, type StudentReport } from "@/actions/report.actions";
import { describeAudit } from "@/lib/audit-format";
import type { ActionResult } from "./auth.actions";

/** Faqat sana ("YYYY-MM-DD") sifatida saqlanadigan maydonlar: UTC yarim tunda yoziladi, vaqt zonasiga bog'liq emas */
const toDate = (key: string) => (key ? new Date(`${key}T00:00:00Z`) : null);
const toKey = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export type StudentPersonalData = Omit<StudentProfileInput, "fullName">;

export interface StudentActivityItem {
  at: string;
  label: string;
  detail: string;
  tone: "success" | "teal" | "warning" | "danger" | "default";
}

export interface StudentProfileData {
  report: StudentReport;
  groupId: string | null;
  photoUrl: string | null;
  personal: StudentPersonalData;
  /** Mentorning shu o'quvchi ustida bajargan amallari (parol tiklash, ko'chirish, ma'lumot yangilash) */
  mentorActions: StudentActivityItem[];
  createdAt: string | null;
  mustChangePassword: boolean;
  telegramLinked: boolean;
}

async function photoUrlOf(key?: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return await getDownloadPresignedUrl({ key });
  } catch {
    return null;
  }
}

/** O'quvchining to'liq profili: shaxsiy ma'lumotlar, hisobot va mentor amallari. Faqat mentor uchun. */
export async function getStudentProfile(studentId: string): Promise<StudentProfileData | null> {
  await requireMentor();
  if (typeof studentId !== "string" || !mongoose.isValidObjectId(studentId)) return null;

  const report = await getStudentReport(studentId);
  if (!report) return null;
  await connectToDatabase();

  const [user, profile, logs] = await Promise.all([
    User.findById(studentId).select("groupId createdAt mustChangePassword telegram.chatId").lean(),
    StudentProfile.findOne({ studentId }).lean(),
    AuditLog.find({ targetUserId: studentId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  return {
    report,
    groupId: user?.groupId ? user.groupId.toString() : null,
    photoUrl: await photoUrlOf(profile?.photoKey),
    personal: {
      birthDate: toKey(profile?.birthDate),
      gender: profile?.gender ?? "",
      phone: profile?.phone ?? "",
      address: profile?.address ?? "",
      school: profile?.school ?? "",
      fatherName: profile?.fatherName ?? "",
      fatherPhone: profile?.fatherPhone ?? "",
      motherName: profile?.motherName ?? "",
      motherPhone: profile?.motherPhone ?? "",
      birthCertNumber: decryptField(profile?.birthCertNumberEnc),
      birthCertIssuedAt: toKey(profile?.birthCertIssuedAt),
      birthCertIssuedBy: profile?.birthCertIssuedBy ?? "",
      passportNumber: decryptField(profile?.passportNumberEnc),
      passportIssuedAt: toKey(profile?.passportIssuedAt),
      passportExpiresAt: toKey(profile?.passportExpiresAt),
      passportIssuedBy: profile?.passportIssuedBy ?? "",
      pinfl: decryptField(profile?.pinflEnc),
      notes: profile?.notes ?? "",
    },
    mentorActions: logs.map((l) => {
      const meta = describeAudit(l.action);
      return { at: new Date(l.createdAt).toISOString(), label: meta.label, detail: "", tone: meta.tone };
    }),
    createdAt: user?.createdAt ? new Date(user.createdAt).toISOString() : null,
    mustChangePassword: Boolean(user?.mustChangePassword),
    telegramLinked: Boolean(user?.telegram?.chatId),
  };
}

/** Guruh ro'yxati uchun: o'quvchilarning rasm havolalari (rasmi borlar) */
export async function getStudentPhotoUrls(studentIds: string[]): Promise<Record<string, string>> {
  await requireMentor();
  const ids = studentIds.filter((id) => mongoose.isValidObjectId(id));
  if (ids.length === 0) return {};
  await connectToDatabase();
  const profiles = await StudentProfile.find({ studentId: { $in: ids }, photoKey: { $ne: null } })
    .select("studentId photoKey")
    .lean();
  const entries = await Promise.all(
    profiles.map(async (p) => [p.studentId.toString(), await photoUrlOf(p.photoKey)] as const)
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, string] => Boolean(e[1])));
}

export async function updateStudentProfileAction(studentId: string, input: unknown): Promise<ActionResult> {
  const mentor = await requireMentor();
  if (typeof studentId !== "string" || !mongoose.isValidObjectId(studentId)) {
    return { success: false, message: "O'quvchi topilmadi" };
  }
  const parsed = studentProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri" };
  }
  const d = parsed.data;

  await connectToDatabase();
  const user = await User.findOne({ _id: studentId, role: "student" });
  if (!user) return { success: false, message: "O'quvchi topilmadi" };

  if (user.fullName !== d.fullName) {
    user.fullName = d.fullName;
    await user.save();
  }

  await StudentProfile.updateOne(
    { studentId },
    {
      $set: {
        birthDate: toDate(d.birthDate),
        gender: (d.gender || null) as Gender | null,
        phone: d.phone,
        address: d.address,
        school: d.school,
        fatherName: d.fatherName,
        fatherPhone: d.fatherPhone,
        motherName: d.motherName,
        motherPhone: d.motherPhone,
        birthCertNumberEnc: encryptField(d.birthCertNumber),
        birthCertIssuedAt: toDate(d.birthCertIssuedAt),
        birthCertIssuedBy: d.birthCertIssuedBy,
        passportNumberEnc: encryptField(d.passportNumber),
        passportIssuedAt: toDate(d.passportIssuedAt),
        passportExpiresAt: toDate(d.passportExpiresAt),
        passportIssuedBy: d.passportIssuedBy,
        pinflEnc: encryptField(d.pinfl),
        notes: d.notes,
      },
    },
    { upsert: true }
  );

  // Audit yozuviga qiymatlar emas, faqat hodisaning o'zi yoziladi (hujjat raqamlari jurnalga tushmaydi)
  await AuditLog.create({
    actorId: mentor.userId,
    action: "UPDATE_STUDENT_PROFILE",
    targetUserId: user._id,
    details: { studentLogin: user.login, fullName: user.fullName },
  });

  revalidatePath(`/mentor/students/${studentId}`);
  if (user.groupId) revalidatePath(`/mentor/groups/${user.groupId}`);
  return { success: true, message: "Ma'lumotlar saqlandi" };
}

/** Rasm brauzerdan omborga yuklangach, uning kaliti profilga yoziladi (null — rasmni olib tashlash) */
export async function setStudentPhotoAction(studentId: string, key: unknown): Promise<ActionResult<{ photoUrl: string | null }>> {
  const mentor = await requireMentor();
  if (typeof studentId !== "string" || !mongoose.isValidObjectId(studentId)) {
    return { success: false, message: "O'quvchi topilmadi" };
  }
  // Kalit faqat shu o'quvchi uchun berilgan papkadan bo'lishi mumkin (boshqa fayllarni rasm sifatida ulab bo'lmaydi)
  if (key !== null && (typeof key !== "string" || !key.startsWith(`avatars/${studentId}/`) || key.includes(".."))) {
    return { success: false, message: "Rasm noto'g'ri" };
  }

  await connectToDatabase();
  const user = await User.findOne({ _id: studentId, role: "student" }).select("login fullName groupId").lean();
  if (!user) return { success: false, message: "O'quvchi topilmadi" };

  await StudentProfile.updateOne({ studentId }, { $set: { photoKey: key } }, { upsert: true });
  await AuditLog.create({
    actorId: mentor.userId,
    action: "UPDATE_STUDENT_PHOTO",
    targetUserId: user._id,
    details: { studentLogin: user.login, fullName: user.fullName, removed: key === null },
  });

  revalidatePath(`/mentor/students/${studentId}`);
  if (user.groupId) revalidatePath(`/mentor/groups/${user.groupId}`);
  return { success: true, message: key ? "Rasm saqlandi" : "Rasm olib tashlandi", data: { photoUrl: await photoUrlOf(key) } };
}
