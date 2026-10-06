import { cache } from "react";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { getSession, SessionPayload } from "./session";

/**
 * Get current authenticated session or null.
 *
 * Sessiya cookie'si 14 kun yashaydi, o'quvchining guruhi esa shu orada o'zgarishi mumkin
 * (mentor ko'chirsa yoki Excel import qilinsa). Shuning uchun o'quvchining guruhi har so'rovda
 * bazadan olinadi — aks holda u eski guruhining darslarini ko'rib qolardi.
 * `cache` bitta so'rov davomida bazaga faqat bir marta murojaat qilinishini ta'minlaydi.
 */
export const getCurrentUser = cache(async (): Promise<SessionPayload | null> => {
  const session = await getSession();
  if (!session) return null;

  await connectToDatabase();
  const user = await User.findById(session.userId).select("groupId role").lean();
  // O'chirilgan yoki roli o'zgargan foydalanuvchining eski cookie'si endi yaroqsiz (mentor uchun ham)
  if (!user || user.role !== session.role) return null;
  if (session.role !== "student") return session;
  return { ...session, groupId: user.groupId ? user.groupId.toString() : null };
});

/**
 * Require valid session, otherwise redirect to /login
 */
export async function requireAuth(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Require mentor role, otherwise throw or redirect
 */
export async function requireMentor(): Promise<SessionPayload> {
  const user = await requireAuth();
  if (user.role !== "mentor") {
    throw new Error("Ruxsat berilmagan: Faqat mentor kirishi mumkin");
  }
  return user;
}

/**
 * Sahifalar uchun: mentor bo'lmagan foydalanuvchini xato sahifasi o'rniga o'z bosh sahifasiga yo'naltiradi
 */
export async function requireMentorPage(): Promise<SessionPayload> {
  const user = await requireAuth();
  if (user.role !== "mentor") {
    redirect("/lessons");
  }
  return user;
}

/**
 * Require student role
 */
export async function requireStudent(): Promise<SessionPayload> {
  const user = await requireAuth();
  if (user.role !== "student") {
    throw new Error("Ruxsat berilmagan: Faqat o'quvchi kirishi mumkin");
  }
  return user;
}

/**
 * Require group access (IDOR prevention):
 * Mentors have access to all groups.
 * Students only have access to their own assigned group.
 */
export async function requireGroupAccess(
  groupId: string | { toString(): string }
): Promise<SessionPayload> {
  const user = await requireAuth();
  if (user.role === "mentor") {
    return user;
  }
  const targetGroupId = typeof groupId === "string" ? groupId : groupId.toString();
  if (!user.groupId || user.groupId.toString() !== targetGroupId) {
    throw new Error("Ruxsat berilmagan: Siz faqat o'z guruhingiz ma'lumotlarini ko'ra olasiz");
  }
  return user;
}
