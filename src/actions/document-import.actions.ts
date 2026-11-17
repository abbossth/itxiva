"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { Group } from "@/lib/db/models/group.model";
import { StudentProfile } from "@/lib/db/models/student-profile.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { decryptField, encryptField } from "@/lib/field-crypto";
import { isValidPinfl, maskValue, pinflBirthInfo } from "@/lib/document-import";
import { fuzzyKey, levenshtein, nameKey, nameTokens } from "@/lib/name-match";

// Ro'yxatdagi JSHSHIR va hujjat raqamlarini o'quvchilar profiliga yozish (mentor uchun).
// Matn brauzerda ajratiladi; server faqat qatorlarni oladi, o'quvchilarni ism bo'yicha topadi va shifrlab saqlaydi.

const docRowSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  pinfl: z.string().trim().refine((v) => v === "" || isValidPinfl(v), "JSHSHIR noto'g'ri"),
  docNumber: z.string().trim().max(30),
  docKind: z.enum(["birthCert", "passport"]),
});
const docRowsSchema = z.array(docRowSchema).min(1).max(1000);
export type DocumentRowInput = z.input<typeof docRowSchema>;

export interface DocumentCandidate {
  userId: string;
  fullName: string;
  groupName: string | null;
}

export interface DocumentPreviewRow {
  index: number;
  fullName: string;
  /** matched — bitta o'quvchi topildi; ambiguous — bir nechta o'xshash; unmatched — topilmadi */
  status: "matched" | "ambiguous" | "unmatched";
  match: DocumentCandidate | null;
  candidates: DocumentCandidate[];
  /** Profilda hozir bor qiymatlar (niqoblangan) va yangisi bilan farqi */
  current: { pinfl: string; docNumber: string };
  change: "new" | "same" | "changed";
}

async function studentCandidates() {
  const [students, groups] = await Promise.all([
    User.find({ role: "student" }).select("fullName groupId").lean(),
    Group.find({}).select("name shortName").lean(),
  ]);
  const groupName = new Map(groups.map((g) => [g._id.toString(), g.shortName?.trim() || g.name]));
  return students.map((s) => ({
    userId: s._id.toString(),
    fullName: s.fullName,
    groupName: s.groupId ? groupName.get(s.groupId.toString()) ?? null : null,
    key: nameKey(s.fullName),
    fuzzy: fuzzyKey(s.fullName),
    tokens: nameTokens(s.fullName),
  }));
}

/** Ro'yxat qatorlarini o'quvchilar bilan solishtiradi. Hech narsa yozmaydi */
export async function previewDocumentImportAction(
  rawRows: DocumentRowInput[]
): Promise<{ success: boolean; message?: string; rows?: DocumentPreviewRow[] }> {
  await requireMentor();
  const parsed = docRowsSchema.safeParse(rawRows);
  if (!parsed.success) return { success: false, message: "Ro'yxatni o'qib bo'lmadi" };
  await connectToDatabase();

  const candidates = await studentCandidates();
  const strip = ({ userId, fullName, groupName }: (typeof candidates)[number]): DocumentCandidate => ({ userId, fullName, groupName });
  const used = new Set<string>();

  const rows = parsed.data.map((row, index) => {
    const key = nameKey(row.fullName);
    const tokens = nameTokens(row.fullName);
    const exact = candidates.filter(
      (c) =>
        !used.has(c.userId) &&
        (c.key === key || (c.tokens.length >= 2 && tokens.length >= 2 && c.tokens.slice(0, 2).every((t) => tokens.includes(t))))
    );
    if (exact.length === 1) {
      used.add(exact[0].userId);
      return { index, fullName: row.fullName, status: "matched" as const, match: strip(exact[0]), candidates: [] };
    }
    const fuzzy = fuzzyKey(row.fullName);
    const similar = (exact.length > 1 ? exact : candidates.filter((c) => !used.has(c.userId) && levenshtein(c.fuzzy, fuzzy) <= 2))
      .slice(0, 5)
      .map(strip);
    return {
      index,
      fullName: row.fullName,
      status: similar.length > 0 ? ("ambiguous" as const) : ("unmatched" as const),
      match: null,
      candidates: similar,
    };
  });

  const ids = [...new Set(rows.flatMap((r) => [r.match, ...r.candidates]).filter(Boolean).map((c) => c!.userId))];
  const profiles = await StudentProfile.find({ studentId: { $in: ids } })
    .select("studentId pinflEnc birthCertNumberEnc passportNumberEnc")
    .lean();
  const profileOf = new Map(profiles.map((p) => [p.studentId.toString(), p]));

  return {
    success: true,
    rows: rows.map((r) => {
      const input = parsed.data[r.index];
      const p = r.match ? profileOf.get(r.match.userId) : undefined;
      const pinfl = decryptField(p?.pinflEnc);
      const docNumber = decryptField(input.docKind === "passport" ? p?.passportNumberEnc : p?.birthCertNumberEnc);
      const norm = (v: string) => v.replace(/\s+/g, "").toUpperCase();
      const change: DocumentPreviewRow["change"] =
        !pinfl && !docNumber
          ? "new"
          : (!input.pinfl || pinfl === input.pinfl) && (!input.docNumber || norm(docNumber) === norm(input.docNumber))
          ? "same"
          : "changed";
      return { ...r, current: { pinfl: pinfl ? maskValue(pinfl) : "", docNumber: docNumber ? maskValue(docNumber) : "" }, change };
    }),
  };
}

const applySchema = z
  .array(docRowSchema.extend({ userId: z.string().refine((v) => mongoose.isValidObjectId(v)) }))
  .min(1)
  .max(1000);
export type DocumentApplyInput = z.input<typeof applySchema>[number];

/**
 * Tasdiqlangan qatorlarni yozadi: JSHSHIR va hujjat raqami (shifrlangan), hujjat turi.
 * Tug'ilgan sana va jins bo'sh bo'lsa JSHSHIRdan to'ldiriladi. Boshqa maydonlarga tegilmaydi.
 */
export async function applyDocumentImportAction(
  rawItems: DocumentApplyInput[]
): Promise<{ success: boolean; message: string; updated?: number }> {
  const mentor = await requireMentor();
  const parsed = applySchema.safeParse(rawItems);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri" };
  await connectToDatabase();

  const ids = parsed.data.map((i) => i.userId);
  const [students, profiles] = await Promise.all([
    User.find({ _id: { $in: ids }, role: "student" }).select("_id groupId").lean(),
    StudentProfile.find({ studentId: { $in: ids } }).select("studentId documentType birthDate gender birthCertNumberEnc passportNumberEnc").lean(),
  ]);
  const studentIds = new Set(students.map((s) => s._id.toString()));
  const profileOf = new Map(profiles.map((p) => [p.studentId.toString(), p]));

  let updated = 0;
  for (const item of parsed.data) {
    if (!studentIds.has(item.userId)) continue;
    const p = profileOf.get(item.userId);
    const $set: Record<string, unknown> = {};
    if (item.pinfl) {
      $set.pinflEnc = encryptField(item.pinfl);
      const info = pinflBirthInfo(item.pinfl);
      if (info && !p?.birthDate) $set.birthDate = new Date(`${info.birthDate}T00:00:00.000Z`);
      if (info && !p?.gender) $set.gender = info.gender;
    }
    if (item.docNumber) {
      $set[item.docKind === "passport" ? "passportNumberEnc" : "birthCertNumberEnc"] = encryptField(item.docNumber);
      // Hujjat o'quvchi profilida ko'rinishi uchun turi ham belgilanadi (tanlangan hujjati bo'sh bo'lsa)
      const currentNumber = p?.documentType === "passport" ? p?.passportNumberEnc : p?.documentType === "birthCert" ? p?.birthCertNumberEnc : null;
      if (!p?.documentType || !currentNumber) $set.documentType = item.docKind;
    }
    if (Object.keys($set).length === 0) continue;
    await StudentProfile.updateOne({ studentId: item.userId }, { $set }, { upsert: true });
    updated++;
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: "IMPORT_STUDENT_DOCUMENTS",
    details: { updated, total: parsed.data.length },
  });

  revalidatePath("/profile");
  revalidatePath("/mentor/students", "layout");
  revalidatePath("/mentor/groups", "layout");
  return { success: true, message: `${updated} ta o'quvchi profiliga hujjat ma'lumotlari yozildi`, updated };
}
