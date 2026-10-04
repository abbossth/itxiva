import { redirect } from "next/navigation";
import { getSession, SessionPayload } from "./session";

/**
 * Get current authenticated session or null
 */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  return getSession();
}

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
