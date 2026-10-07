"use server";

import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { requireAuth } from "@/lib/auth/guards";
import { ActionResult } from "./auth.actions";

/** Reytingdagi salyutni (konfetti, ovoz, titrash) foydalanuvchi o'zi uchun yoqadi yoki o'chiradi */
export async function setCelebrationsEnabledAction(enabled: unknown): Promise<ActionResult> {
  const session = await requireAuth();
  if (typeof enabled !== "boolean") return { success: false, message: "Noto'g'ri sozlama" };
  await connectToDatabase();
  await User.updateOne({ _id: session.userId }, { $set: { celebrationsEnabled: enabled } });
  revalidatePath("/leaderboard");
  return { success: true };
}
