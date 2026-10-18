"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db/connect";
import { Announcement, AnnouncementView, type IAnnouncement } from "@/lib/db/models/announcement.model";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor, requireStudent } from "@/lib/auth/guards";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import {
  ANNOUNCEMENT_LIMITS,
  announcementActive,
  announcementPhase,
  audienceIncludes,
  type AnnouncementAudience,
  type AnnouncementPhase,
  type AnnouncementTheme,
} from "@/lib/announcements";
import { groupShortName } from "@/lib/group-name";
import type { ActionResult } from "./auth.actions";

// ---------- Ko'rinishlar ----------

export interface AnnouncementFileView {
  key: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface MentorAnnouncement {
  _id: string;
  title: string;
  body: string;
  theme: AnnouncementTheme;
  images: AnnouncementFileView[];
  files: AnnouncementFileView[];
  links: { label: string; url: string }[];
  audience: AnnouncementAudience;
  groupIds: string[];
  grades: number[];
  startsAt: string;
  endsAt: string | null;
  status: "draft" | "published" | "archived";
  phase: AnnouncementPhase;
  publishedAt: string | null;
  createdAt: string;
}

export interface AnnouncementListItem extends MentorAnnouncement {
  active: boolean;
  audienceLabel: string;
  stats: { audience: number; seen: number; dismissed: number; clicked: number };
}

/** O'quvchiga ko'rsatiladigan e'lon: rasmlar vaqtinchalik havolalar bilan, fayl kalitlari berilmaydi */
export interface StudentAnnouncement {
  _id: string;
  title: string;
  body: string;
  theme: AnnouncementTheme;
  images: { url: string; name: string }[];
  files: { index: number; name: string; size: number }[];
  links: { index: number; label: string; url: string }[];
  publishedAt: string | null;
  /** Shu e'londan keyin yana nechta ko'rilmagan e'lon bor */
  remaining: number;
}

function toMentorView(a: IAnnouncement): MentorAnnouncement {
  const files = (list: IAnnouncement["files"]) => (list ?? []).map((f) => ({ key: f.key, name: f.name, size: f.size, mimeType: f.mimeType }));
  return {
    _id: a._id.toString(),
    title: a.title,
    body: a.body ?? "",
    theme: a.theme,
    images: files(a.images),
    files: files(a.files),
    links: (a.links ?? []).map((l) => ({ label: l.label ?? "", url: l.url })),
    audience: a.audience,
    groupIds: (a.groupIds ?? []).map(String),
    grades: a.grades ?? [],
    startsAt: new Date(a.startsAt).toISOString(),
    endsAt: a.endsAt ? new Date(a.endsAt).toISOString() : null,
    status: a.status,
    phase: announcementPhase(a),
    publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null,
    createdAt: new Date(a.createdAt).toISOString(),
  };
}

// ---------- Mentor: yaratish va boshqarish ----------

const fileSchema = z.object({
  key: z.string().min(1).max(400),
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(0).max(200 * 1024 * 1024),
  mimeType: z.string().max(120),
});

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Havola noto'g'ri");

const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "Sarlavha yozing").max(ANNOUNCEMENT_LIMITS.title, "Sarlavha juda uzun"),
    body: z.string().max(ANNOUNCEMENT_LIMITS.body, "Matn juda uzun").default(""),
    theme: z.enum(["info", "important", "holiday", "celebration"]).default("info"),
    images: z.array(fileSchema).max(ANNOUNCEMENT_LIMITS.images, `Ko'pi bilan ${ANNOUNCEMENT_LIMITS.images} ta rasm`).default([]),
    files: z.array(fileSchema).max(ANNOUNCEMENT_LIMITS.files, `Ko'pi bilan ${ANNOUNCEMENT_LIMITS.files} ta fayl`).default([]),
    links: z
      .array(z.object({ label: z.string().trim().max(80).default(""), url: httpsUrl }))
      .max(ANNOUNCEMENT_LIMITS.links, `Ko'pi bilan ${ANNOUNCEMENT_LIMITS.links} ta havola`)
      .default([]),
    audience: z.enum(["all", "groups", "grades"]).default("all"),
    groupIds: z.array(z.string().refine((v) => mongoose.isValidObjectId(v), "Guruh noto'g'ri")).max(200).default([]),
    grades: z.array(z.number().int().min(1).max(12)).max(12).default([]),
    startsAt: z.string().datetime({ offset: true }).nullable().optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    publish: z.boolean().default(false),
  })
  .refine((v) => v.audience !== "groups" || v.groupIds.length > 0, { message: "Kamida bitta guruh tanlang", path: ["groupIds"] })
  .refine((v) => v.audience !== "grades" || v.grades.length > 0, { message: "Kamida bitta sinf tanlang", path: ["grades"] })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), {
    message: "Tugash vaqti boshlanishdan keyin bo'lsin",
    path: ["endsAt"],
  });

export async function saveAnnouncementAction(input: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const mentor = await requireMentor();
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  await connectToDatabase();

  const doc = {
    title: v.title,
    body: v.body,
    theme: v.theme,
    images: v.images,
    files: v.files,
    links: v.links.map((l) => ({ label: l.label, url: l.url })),
    audience: v.audience,
    groupIds: v.audience === "groups" ? v.groupIds.map((g) => new mongoose.Types.ObjectId(g)) : [],
    grades: v.audience === "grades" ? v.grades : [],
    startsAt: v.startsAt ? new Date(v.startsAt) : new Date(),
    endsAt: v.endsAt ? new Date(v.endsAt) : null,
  };

  let saved: IAnnouncement | null;
  if (id) {
    if (!mongoose.isValidObjectId(id)) return { success: false, message: "E'lon topilmadi" };
    const existing = await Announcement.findById(id);
    if (!existing) return { success: false, message: "E'lon topilmadi" };
    Object.assign(existing, doc);
    if (v.publish && existing.status !== "published") {
      existing.status = "published";
      existing.publishedAt = new Date();
    }
    saved = await existing.save();
  } else {
    saved = await Announcement.create({
      ...doc,
      status: v.publish ? "published" : "draft",
      publishedAt: v.publish ? new Date() : null,
      createdBy: mentor.userId,
    });
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: id ? "UPDATE_ANNOUNCEMENT" : "CREATE_ANNOUNCEMENT",
    details: { announcementId: saved._id.toString(), title: saved.title, status: saved.status },
  });
  revalidatePath("/mentor/announcements");
  return {
    success: true,
    message: saved.status === "published" ? "E'lon nashr etildi — o'quvchilar keyingi kirishida ko'radi" : "Qoralama saqlandi",
    data: { id: saved._id.toString() },
  };
}

/** Nashr etish, qoralamaga qaytarish yoki arxivlash (o'chirilmaydi — statistika saqlanadi) */
export async function setAnnouncementStatusAction(id: string, status: "draft" | "published" | "archived"): Promise<ActionResult> {
  const mentor = await requireMentor();
  if (!mongoose.isValidObjectId(id) || !["draft", "published", "archived"].includes(status)) {
    return { success: false, message: "Noto'g'ri so'rov" };
  }
  await connectToDatabase();
  const a = await Announcement.findById(id);
  if (!a) return { success: false, message: "E'lon topilmadi" };
  a.status = status;
  if (status === "published" && !a.publishedAt) a.publishedAt = new Date();
  await a.save();
  await AuditLog.create({ actorId: mentor.userId, action: "UPDATE_ANNOUNCEMENT", details: { announcementId: id, status } });
  revalidatePath("/mentor/announcements");
  return {
    success: true,
    message: status === "published" ? "Nashr etildi" : status === "archived" ? "Arxivlandi — o'quvchilarga ko'rinmaydi" : "Qoralamaga qaytarildi",
  };
}

/** Auditoriyadagi o'quvchilar (faqat faollar) */
async function audienceStudents(a: Pick<IAnnouncement, "audience" | "groupIds" | "grades">) {
  const groups = await Group.find({ isActive: true }).select("_id name shortName grade").lean();
  const allowed = groups.filter((g) =>
    a.audience === "all" ? true : a.audience === "groups" ? (a.groupIds ?? []).some((id) => String(id) === String(g._id)) : (a.grades ?? []).includes(g.grade)
  );
  const groupMap = new Map(allowed.map((g) => [String(g._id), g]));
  const students = await User.find({ role: "student", groupId: { $in: allowed.map((g) => g._id) } })
    .select("_id fullName groupId")
    .sort({ fullName: 1 })
    .lean();
  return students.map((s) => {
    const g = groupMap.get(String(s.groupId));
    return { _id: String(s._id), fullName: s.fullName, groupName: g ? groupShortName(g) : "—" };
  });
}

async function audienceLabel(a: Pick<IAnnouncement, "audience" | "groupIds" | "grades">): Promise<string> {
  if (a.audience === "all") return "Barcha o'quvchilar";
  if (a.audience === "grades") return `${[...(a.grades ?? [])].sort((x, y) => x - y).join(", ")}-sinflar`;
  const groups = await Group.find({ _id: { $in: a.groupIds } }).select("name shortName").lean();
  return groups.map((g) => groupShortName(g)).join(", ") || "Guruhlar";
}

export async function getAnnouncementsForMentor(): Promise<AnnouncementListItem[]> {
  await requireMentor();
  await connectToDatabase();
  const list = await Announcement.find({}).sort({ createdAt: -1 }).limit(200);
  const ids = list.map((a) => a._id);
  const viewRows = await AnnouncementView.aggregate<{ _id: mongoose.Types.ObjectId; seen: number; dismissed: number; clicked: number }>([
    { $match: { announcementId: { $in: ids } } },
    {
      $group: {
        _id: "$announcementId",
        seen: { $sum: 1 },
        dismissed: { $sum: { $cond: [{ $ne: ["$dismissedAt", null] }, 1, 0] } },
        clicked: { $sum: { $cond: [{ $gt: ["$clicks", 0] }, 1, 0] } },
      },
    },
  ]);
  const byId = new Map(viewRows.map((r) => [String(r._id), r]));
  // Auditoriya soni: guruhlar va har guruhdagi o'quvchilar soni bir marta olinadi
  const groups = await Group.find({ isActive: true }).select("_id grade").lean();
  const perGroup = new Map(
    (
      await User.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
        { $match: { role: "student", groupId: { $in: groups.map((g) => g._id) } } },
        { $group: { _id: "$groupId", n: { $sum: 1 } } },
      ])
    ).map((r) => [String(r._id), r.n])
  );
  const audienceCount = (a: IAnnouncement) =>
    groups
      .filter((g) =>
        a.audience === "all" ? true : a.audience === "groups" ? a.groupIds.some((id) => String(id) === String(g._id)) : a.grades.includes(g.grade)
      )
      .reduce((s, g) => s + (perGroup.get(String(g._id)) ?? 0), 0);
  return Promise.all(
    list.map(async (a) => {
      const r = byId.get(a._id.toString());
      const audience = audienceCount(a);
      return {
        ...toMentorView(a),
        active: announcementActive(a),
        audienceLabel: await audienceLabel(a),
        stats: { audience, seen: r?.seen ?? 0, dismissed: r?.dismissed ?? 0, clicked: r?.clicked ?? 0 },
      };
    })
  );
}

export async function getAnnouncementForMentor(id: string): Promise<MentorAnnouncement | null> {
  await requireMentor();
  if (!mongoose.isValidObjectId(id)) return null;
  await connectToDatabase();
  const a = await Announcement.findById(id);
  return a ? toMentorView(a) : null;
}

export interface AnnouncementStats {
  announcement: MentorAnnouncement & { audienceLabel: string; active: boolean };
  totals: { audience: number; seen: number; dismissed: number; clicked: number; views: number };
  /** Har bir havola/fayl/rasm necha o'quvchi bosgani */
  targets: { id: string; kind: "link" | "file" | "image"; label: string; students: number }[];
  students: { _id: string; fullName: string; groupName: string; seenAt: string | null; dismissedAt: string | null; views: number; clicks: number }[];
}

export async function getAnnouncementStats(id: string): Promise<AnnouncementStats | null> {
  await requireMentor();
  if (!mongoose.isValidObjectId(id)) return null;
  await connectToDatabase();
  const a = await Announcement.findById(id);
  if (!a) return null;
  const [students, views] = await Promise.all([audienceStudents(a), AnnouncementView.find({ announcementId: a._id }).lean()]);
  const viewBy = new Map(views.map((v) => [String(v.studentId), v]));

  const targets: AnnouncementStats["targets"] = [
    ...a.links.map((l, i) => ({ id: `link:${i}`, kind: "link" as const, label: l.label || l.url })),
    ...a.files.map((f, i) => ({ id: `file:${i}`, kind: "file" as const, label: f.name })),
    ...a.images.map((f, i) => ({ id: `image:${i}`, kind: "image" as const, label: f.name })),
  ].map((t) => ({ ...t, students: views.filter((v) => v.clicked?.includes(t.id)).length }));

  return {
    announcement: { ...toMentorView(a), audienceLabel: await audienceLabel(a), active: announcementActive(a) },
    totals: {
      audience: students.length,
      seen: views.length,
      dismissed: views.filter((v) => v.dismissedAt).length,
      clicked: views.filter((v) => (v.clicks ?? 0) > 0).length,
      views: views.reduce((s, v) => s + (v.views ?? 0), 0),
    },
    targets,
    students: students.map((s) => {
      const v = viewBy.get(s._id);
      return {
        ...s,
        seenAt: v ? new Date(v.firstSeenAt).toISOString() : null,
        dismissedAt: v?.dismissedAt ? new Date(v.dismissedAt).toISOString() : null,
        views: v?.views ?? 0,
        clicks: v?.clicks ?? 0,
      };
    }),
  };
}

/** Mentor tahrirlash/oldindan ko'rish uchun rasmlarni ochadi */
export async function getAnnouncementPreviewUrls(keys: string[]): Promise<string[]> {
  await requireMentor();
  return Promise.all(keys.slice(0, ANNOUNCEMENT_LIMITS.images).map((key) => getDownloadPresignedUrl({ key, expiresInSeconds: 3600 })));
}

// ---------- O'quvchi: ko'rish, yopish, bosish ----------

async function studentScope(userId: string) {
  const user = await User.findById(userId).select("groupId").lean();
  const group = user?.groupId ? await Group.findById(user.groupId).select("grade").lean() : null;
  return { groupId: user?.groupId ? String(user.groupId) : null, grade: group?.grade ?? null };
}

/** O'quvchiga tegishli, faol va hali yopilmagan e'lonlar (eng eskisi birinchi) */
async function pendingFor(userId: string) {
  const now = new Date();
  const [scope, dismissed] = await Promise.all([
    studentScope(userId),
    AnnouncementView.find({ studentId: userId, dismissedAt: { $ne: null } }).distinct("announcementId"),
  ]);
  const candidates = await Announcement.find({
    status: "published",
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    _id: { $nin: dismissed },
  })
    .sort({ publishedAt: 1, createdAt: 1 })
    .limit(30);
  return { scope, list: candidates.filter((a) => audienceIncludes(a, scope)) };
}

/** Kirishda ko'rsatiladigan navbatdagi e'lon (bo'lmasa null) */
export async function getPendingAnnouncement(): Promise<StudentAnnouncement | null> {
  const session = await requireStudent();
  await connectToDatabase();
  const { list } = await pendingFor(session.userId);
  const a = list[0];
  if (!a) return null;
  const images = await Promise.all(
    a.images.map(async (img) => ({ url: await getDownloadPresignedUrl({ key: img.key, expiresInSeconds: 3600 }), name: img.name }))
  );
  return {
    _id: a._id.toString(),
    title: a.title,
    body: a.body ?? "",
    theme: a.theme,
    images,
    files: a.files.map((f, index) => ({ index, name: f.name, size: f.size })),
    links: a.links.map((l, index) => ({ index, label: l.label || l.url, url: l.url })),
    publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : null,
    remaining: list.length - 1,
  };
}

async function loadForStudent(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  const a = await Announcement.findById(id);
  if (!a || !announcementActive(a)) return null;
  const scope = await studentScope(userId);
  return audienceIncludes(a, scope) ? a : null;
}

/** E'lon ochildi (ko'rildi) */
export async function markAnnouncementSeenAction(id: string): Promise<ActionResult> {
  const session = await requireStudent();
  await connectToDatabase();
  const a = await loadForStudent(session.userId, id);
  if (!a) return { success: false };
  const now = new Date();
  await AnnouncementView.updateOne(
    { announcementId: a._id, studentId: session.userId },
    { $setOnInsert: { firstSeenAt: now }, $set: { lastSeenAt: now }, $inc: { views: 1 } },
    { upsert: true }
  );
  return { success: true };
}

/** "Tushunarli" — e'lon boshqa ko'rsatilmaydi */
export async function dismissAnnouncementAction(id: string): Promise<ActionResult> {
  const session = await requireStudent();
  await connectToDatabase();
  if (!mongoose.isValidObjectId(id)) return { success: false };
  const now = new Date();
  await AnnouncementView.updateOne(
    { announcementId: id, studentId: session.userId },
    { $setOnInsert: { firstSeenAt: now, views: 1 }, $set: { lastSeenAt: now, dismissedAt: now } },
    { upsert: true }
  );
  return { success: true };
}

async function recordClick(studentId: string, announcementId: mongoose.Types.ObjectId, target: string) {
  const now = new Date();
  await AnnouncementView.updateOne(
    { announcementId, studentId },
    { $setOnInsert: { firstSeenAt: now }, $set: { lastSeenAt: now }, $addToSet: { clicked: target }, $inc: { clicks: 1 } },
    { upsert: true }
  );
}

/** Havola yoki rasm bosildi (statistika uchun) */
export async function trackAnnouncementClickAction(id: string, target: string): Promise<ActionResult> {
  const session = await requireStudent();
  if (typeof target !== "string" || !/^(link|image):\d{1,2}$/.test(target)) return { success: false };
  await connectToDatabase();
  const a = await loadForStudent(session.userId, id);
  if (!a) return { success: false };
  await recordClick(session.userId, a._id, target);
  return { success: true };
}

/** Faylni yuklab olish havolasi: faqat auditoriyadagi o'quvchiga; bosilgani yoziladi */
export async function getAnnouncementFileUrlAction(id: string, index: number): Promise<{ success: boolean; url?: string; message?: string }> {
  const session = await requireStudent();
  await connectToDatabase();
  const a = await loadForStudent(session.userId, id);
  const file = a && Number.isInteger(index) ? a.files[index] : null;
  if (!a || !file) return { success: false, message: "Fayl topilmadi" };
  await recordClick(session.userId, a._id, `file:${index}`);
  return { success: true, url: await getDownloadPresignedUrl({ key: file.key, expiresInSeconds: 600 }) };
}
