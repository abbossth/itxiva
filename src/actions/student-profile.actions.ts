"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { StudentProfile, type Gender } from "@/lib/db/models/student-profile.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireStudent } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { decryptField, encryptField } from "@/lib/field-crypto";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import { ownProfileSchema, studentProfileSchema, type OwnProfileInput, type StudentProfileInput } from "@/lib/validations/student-profile.schema";
import { getMyReport, getStudentReport, type StudentReport } from "@/actions/report.actions";
import { Group } from "@/lib/db/models/group.model";
import { Quest } from "@/lib/db/models/quest.model";
import { QuestSubmission } from "@/lib/db/models/quest-submission.model";
import { StudentBadge } from "@/lib/db/models/student-badge.model";
import { BADGE_COUNT } from "@/lib/gamification/badges";
import { buildLevels, levelProgress } from "@/lib/gamification/levels";
import { effectiveStreak } from "@/lib/gamification/streak";
import { dayKey, monthKey } from "@/lib/gamification/periods";
import { groupMonthAttendance } from "@/lib/gamification/achievements";
import { formatSchedule, getNextLesson } from "@/lib/schedule";
import { describeAudit } from "@/lib/audit-format";
import { checkRateLimit } from "@/lib/rate-limit";
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

type ProfileLean = Awaited<ReturnType<typeof loadProfile>>;
const loadProfile = (studentId: string) => StudentProfile.findOne({ studentId }).lean();

/** Bazadagi hujjatdan forma qiymatlari (mentor izohisiz) */
function toOwnData(profile: ProfileLean): OwnProfileInput {
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

/** Forma qiymatlaridan bazaga yoziladigan maydonlar (hujjat raqamlari shifrlanadi) */
function toStoredFields(d: OwnProfileInput) {
  return {
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
  };
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
    personal: { ...toOwnData(profile), notes: profile?.notes ?? "" },
    mentorActions: logs.map((l) => {
      const meta = describeAudit(l.action);
      const bySelf = l.actorId?.toString() === studentId;
      return { at: new Date(l.createdAt).toISOString(), label: meta.label, detail: bySelf ? "O'quvchining o'zi" : "Mentor amali", tone: meta.tone };
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
      $set: { ...toStoredFields(d), notes: d.notes },
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

/* ------------------------------------------------------------------ */
/* O'quvchining o'zi                                                    */
/* ------------------------------------------------------------------ */

export interface OwnProfileData {
  photoUrl: string | null;
  personal: OwnProfileInput;
  /** Mentor sozlamalarda tahrirlashni ochganmi */
  canEdit: boolean;
}

/** O'quvchining o'z ma'lumotlari. Mentor izohi (notes) bu yerga hech qachon qo'shilmaydi. */
export async function getOwnProfile(): Promise<OwnProfileData> {
  const session = await requireStudent();
  await connectToDatabase();
  const [profile, settings] = await Promise.all([loadProfile(session.userId), getAppSettings()]);
  return { photoUrl: await photoUrlOf(profile?.photoKey), personal: toOwnData(profile), canEdit: settings.studentProfileEdit };
}

export async function updateOwnProfileAction(input: unknown): Promise<ActionResult> {
  const session = await requireStudent();
  // Ruxsat har safar serverda tekshiriladi: mentor yopgan bo'lsa, eski ochiq sahifadan ham saqlab bo'lmaydi
  if (!(await getAppSettings()).studentProfileEdit) {
    return { success: false, message: "Ma'lumotlarni tahrirlash mentor tomonidan yopilgan" };
  }
  const rate = checkRateLimit(`own_profile_${session.userId}`, 20, 10 * 60 * 1000);
  if (!rate.allowed) return { success: false, message: "Juda ko'p urinish. Birozdan keyin urinib ko'ring" };

  const parsed = ownProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri" };
  }

  await connectToDatabase();
  await StudentProfile.updateOne({ studentId: session.userId }, { $set: toStoredFields(parsed.data) }, { upsert: true });
  await AuditLog.create({
    actorId: session.userId,
    action: "STUDENT_UPDATE_OWN_PROFILE",
    targetUserId: session.userId,
    details: { studentLogin: session.login, fullName: session.fullName },
  });

  revalidatePath("/profile");
  revalidatePath(`/mentor/students/${session.userId}`);
  return { success: true, message: "Ma'lumotlar saqlandi" };
}

/** O'quvchi o'z rasmini qo'yadi yoki olib tashlaydi (null) */
export async function setOwnPhotoAction(key: unknown): Promise<ActionResult<{ photoUrl: string | null }>> {
  const session = await requireStudent();
  if (key !== null && (typeof key !== "string" || !key.startsWith(`avatars/${session.userId}/`) || key.includes(".."))) {
    return { success: false, message: "Rasm noto'g'ri" };
  }
  await connectToDatabase();
  await StudentProfile.updateOne({ studentId: session.userId }, { $set: { photoKey: key } }, { upsert: true });
  await AuditLog.create({
    actorId: session.userId,
    action: "STUDENT_UPDATE_OWN_PHOTO",
    targetUserId: session.userId,
    details: { studentLogin: session.login, fullName: session.fullName, removed: key === null },
  });

  revalidatePath("/profile");
  revalidatePath(`/mentor/students/${session.userId}`);
  if (session.groupId) revalidatePath(`/mentor/groups/${session.groupId}`);
  return { success: true, message: key ? "Rasm saqlandi" : "Rasm olib tashlandi", data: { photoUrl: await photoUrlOf(key) } };
}

export interface MyGroupInfo {
  name: string;
  grade: number;
  academicYear: string;
  schedule: string;
  nextLesson: { label: string; isNow: boolean } | null;
  students: number;
  /** Joriy oyda guruh davomati, % */
  monthAttendance: number | null;
  /** Reytingdagi o'rnim (yashirilgan o'quvchilarsiz) */
  myRank: number | null;
  /** Guruh reytingining boshi: o'quvchining o'zi har doim belgilanadi */
  top: { name: string; value: number; rank: number; isMe: boolean }[];
}

export interface MyProfileData {
  report: StudentReport;
  photoUrl: string | null;
  personal: OwnProfileInput;
  canEdit: boolean;
  createdAt: string | null;
  group: MyGroupInfo | null;
  /** Reyting o'lchovi: gamifikatsiya yoqilgan bo'lsa XP, aks holda coin */
  unit: "XP" | "coin";
  gamification: {
    level: number;
    levelName: string;
    xp: number;
    percent: number;
    toNext: number;
    nextName: string | null;
    streak: number;
    bestStreak: number;
    shields: number;
    badges: number;
    badgeTotal: number;
  } | null;
  quests: { title: string; status: "pending" | "approved" | "rejected"; coins: number; at: string }[];
}

/** O'quvchining o'z profili: o'zi, guruhi, natijalari va tarixlari */
export async function getMyProfile(): Promise<MyProfileData | null> {
  const session = await requireStudent();
  const report = await getMyReport();
  if (!report) return null;
  await connectToDatabase();

  const [user, profile, settings] = await Promise.all([
    User.findById(session.userId).select("groupId createdAt xp streak streakShields isHiddenFromLeaderboard").lean(),
    loadProfile(session.userId),
    getAppSettings(),
  ]);
  const xpMode = settings.gamification.enabled;
  const field = xpMode ? "xp" : "totalCoins";
  const groupId = user?.groupId ?? null;

  const [group, classmates, monthMap, badges, submissions] = await Promise.all([
    groupId ? Group.findById(groupId).select("name grade academicYear schedule").lean() : null,
    groupId
      ? User.find({ groupId, role: "student", isHiddenFromLeaderboard: { $ne: true } })
          .select(`fullName ${field}`)
          .sort({ [field]: -1, fullName: 1 })
          .lean()
      : [],
    groupId ? groupMonthAttendance(monthKey(), [groupId]) : new Map<string, number>(),
    xpMode ? StudentBadge.countDocuments({ studentId: session.userId }) : 0,
    QuestSubmission.find({ studentId: session.userId })
      .select("questId status coins submittedAt reviewedAt createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);
  const questTitles = new Map(
    (await Quest.find({ _id: { $in: submissions.map((q) => q.questId) } }).select("title").lean()).map((q) => [String(q._id), q.title])
  );

  // Teng ko'rsatkichdagilar bir xil o'rinda (reyting sahifasidagidek)
  const valueOf = (u: (typeof classmates)[number]) => Math.max(0, Math.round((xpMode ? u.xp : u.totalCoins) ?? 0));
  const ranked = classmates.map((u, i) => ({ u, value: valueOf(u), rank: i + 1 }));
  for (let i = 1; i < ranked.length; i++) if (ranked[i].value === ranked[i - 1].value) ranked[i].rank = ranked[i - 1].rank;
  const me = ranked.find((r) => String(r.u._id) === session.userId) ?? null;
  const top = ranked.slice(0, 3);
  if (me && !top.includes(me)) top.push(me);

  const next = group ? getNextLesson(group.schedule) : null;
  const levels = buildLevels(settings.gamification.levelThresholds);
  const p = levelProgress(user?.xp ?? 0, levels);

  return {
    report,
    photoUrl: await photoUrlOf(profile?.photoKey),
    personal: toOwnData(profile),
    canEdit: settings.studentProfileEdit,
    createdAt: user?.createdAt ? new Date(user.createdAt).toISOString() : null,
    unit: xpMode ? "XP" : "coin",
    group: group
      ? {
          name: group.name,
          grade: group.grade,
          academicYear: group.academicYear,
          schedule: formatSchedule(group.schedule),
          nextLesson: next ? { label: next.label, isNow: next.isNow } : null,
          students: classmates.length,
          monthAttendance: monthMap.get(String(group._id)) ?? null,
          myRank: me?.rank ?? null,
          top: top.map((r) => ({ name: r.u.fullName, value: r.value, rank: r.rank, isMe: r === me })),
        }
      : null,
    gamification: xpMode
      ? {
          level: p.current.level,
          levelName: p.current.name,
          xp: p.xp,
          percent: p.percent,
          toNext: p.toNext,
          nextName: p.next?.name ?? null,
          streak: effectiveStreak(user?.streak, dayKey(), user?.streakShields ?? 0),
          bestStreak: user?.streak?.best ?? 0,
          shields: user?.streakShields ?? 0,
          badges,
          badgeTotal: BADGE_COUNT,
        }
      : null,
    quests: submissions.map((q) => ({
      title: questTitles.get(String(q.questId)) ?? "Topshiriq",
      status: q.status,
      coins: q.coins ?? 0,
      at: new Date(q.reviewedAt ?? q.submittedAt ?? q.createdAt ?? Date.now()).toISOString(),
    })),
  };
}
