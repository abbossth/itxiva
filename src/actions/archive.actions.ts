"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Archive, ArchiveKind } from "@/lib/db/models/archive.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import "@/lib/db/models/user.model";
import { requireMentor } from "@/lib/auth/guards";
import { ArchiveResult, describeArchiveCounts, purgeArchive, restoreArchive } from "@/lib/archive";

export interface ArchiveItem {
  _id: string;
  kind: ArchiveKind;
  title: string;
  subtitle: string;
  /** Birga arxivlangan yozuvlar ("12 ta davomat yozuvi, …") */
  contents: string;
  deletedBy: string;
  deletedAt: string;
}

export async function getArchiveItems(): Promise<ArchiveItem[]> {
  await requireMentor();
  await connectToDatabase();
  const rows = await Archive.find().sort({ createdAt: -1 }).limit(500).populate("deletedBy", "fullName").lean();
  return rows.map((r) => ({
    _id: r._id.toString(),
    kind: r.kind,
    title: r.title,
    subtitle: r.subtitle ?? "",
    contents: describeArchiveCounts(r.counts),
    deletedBy: (r.deletedBy as unknown as { fullName?: string } | null)?.fullName ?? "",
    deletedAt: new Date(r.createdAt).toISOString(),
  }));
}

export async function getArchiveCount(): Promise<number> {
  await requireMentor();
  await connectToDatabase();
  return Archive.countDocuments();
}

async function run(action: "ARCHIVE_RESTORE" | "ARCHIVE_PURGE", archiveId: string): Promise<ArchiveResult> {
  const mentor = await requireMentor();
  await connectToDatabase();
  const archive = await Archive.findById(typeof archiveId === "string" && /^[a-f\d]{24}$/i.test(archiveId) ? archiveId : null)
    .select("kind title entityId")
    .lean();
  if (!archive) return { success: false, message: "Arxiv yozuvi topilmadi" };

  const result = action === "ARCHIVE_RESTORE" ? await restoreArchive(archiveId) : await purgeArchive(archiveId);
  if (result.success) {
    await AuditLog.create({
      actorId: mentor.userId,
      action,
      details: { kind: archive.kind, title: archive.title, entityId: archive.entityId.toString() },
    });
    // Tiklangan narsa har qaysi bo'limda paydo bo'lishi mumkin
    revalidatePath("/", "layout");
  }
  return result;
}

export async function restoreArchiveAction(archiveId: string): Promise<ArchiveResult> {
  return run("ARCHIVE_RESTORE", archiveId);
}

export async function purgeArchiveAction(archiveId: string): Promise<ArchiveResult> {
  return run("ARCHIVE_PURGE", archiveId);
}
