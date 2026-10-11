"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { AppSettings } from "@/lib/db/models/app-settings.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { requireMentor } from "@/lib/auth/guards";
import { isAcademicYear } from "@/lib/settings";
import { isAccentId } from "@/lib/theme-accents";
import type { ActionResult } from "./auth.actions";

/** Joriy o'quv yili, chorak va asosiy rang — barcha foydalanuvchilar uchun */
export async function updateAppSettingsAction(input: unknown): Promise<ActionResult> {
  const mentor = await requireMentor();
  const { academicYear, quarter, accent } = (input ?? {}) as Record<string, unknown>;

  if (!isAcademicYear(academicYear)) return { success: false, message: "O'quv yili noto'g'ri (masalan: 2026-2027)" };
  if (typeof quarter !== "number" || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    return { success: false, message: "Chorak 1 dan 4 gacha bo'lishi kerak" };
  }
  if (!isAccentId(accent)) return { success: false, message: "Rang noto'g'ri tanlangan" };

  await connectToDatabase();
  await AppSettings.updateOne({ key: "global" }, { $set: { academicYear, quarter, accent } }, { upsert: true });
  await AuditLog.create({
    actorId: mentor.userId,
    action: "UPDATE_SETTINGS",
    details: { academicYear, quarter, accent },
  });

  // Rang va standart chorak barcha sahifalarga ta'sir qiladi
  revalidatePath("/", "layout");
  return { success: true, message: "Sozlamalar saqlandi" };
}
