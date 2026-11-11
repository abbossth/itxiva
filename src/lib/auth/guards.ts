import { cache } from "react";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { getSession, SessionPayload } from "./session";

/**
 * Get current authenticated session or null.
 *
 * Sessiya cookie'si bir necha kun yashaydi, o'quvchining guruhi esa shu orada o'zgarishi mumkin
 * (mentor ko'chirsa yoki Excel import qilinsa). Shuning uchun o'quvchining guruhi har so'rovda
 * bazadan olinadi — aks holda u eski guruhining darslarini ko'rib qolardi.
 * `cache` bitta so'rov davomida bazaga faqat bir marta murojaat qilinishini ta'minlaydi.
 */
// Foydalanuvchi holati server nusxasida 5 soniya saqlanadi: jonli o'yinda 100 o'quvchi har 1,5 s so'raganda
// har so'rovga alohida baza murojaati ketmasin. Parol/rol/guruh o'zgarishi ko'pi bilan 5 soniyada kuchga kiradi.
type UserFacts = { groupId?: { toString(): string } | null; role: string; mustChangePassword?: boolean; sessionVersion?: number } | null;
const USER_TTL_MS = process.env.VITEST ? 0 : 5000;
const userFacts = new Map<string, { at: number; p: Promise<UserFacts> }>();

function loadUserFacts(userId: string, fresh = false): Promise<UserFacts> {
  const now = Date.now();
  const c = userFacts.get(userId);
  if (!fresh && c && now - c.at < USER_TTL_MS) return c.p;
  const p = (async () => {
    await connectToDatabase();
    return User.findById(userId).select("groupId role mustChangePassword sessionVersion").lean<UserFacts>();
  })().catch((err) => {
    userFacts.delete(userId);
    throw err;
  });
  if (userFacts.size > 5000) userFacts.clear();
  userFacts.set(userId, { at: now, p });
  return p;
}

/** Shu server nusxasida foydalanuvchi holatini darhol qayta o'qish (parol, rol yoki guruh o'zgarganda) */
export function forgetUserFacts(userId: string) {
  userFacts.delete(String(userId));
}

export const getCurrentUser = cache(async (): Promise<SessionPayload | null> => {
  const session = await getSession();
  if (!session) return null;

  let user = await loadUserFacts(session.userId);
  // Kesh cookie'dan eskiroq bo'lishi mumkin (masalan, parol hozirgina boshqa server nusxasida almashtirildi) —
  // mos kelmasa, bazadan qayta o'qiladi; haqiqatan bekor qilingan sessiya baribir rad etiladi
  if (
    user &&
    ((user.sessionVersion ?? 0) !== (session.sessionVersion ?? 0) || Boolean(user.mustChangePassword) !== Boolean(session.mustChangePassword))
  ) {
    user = await loadUserFacts(session.userId, true);
  }
  // O'chirilgan yoki roli o'zgargan foydalanuvchining eski cookie'si endi yaroqsiz (mentor uchun ham)
  if (!user || user.role !== session.role) return null;
  // Parol almashtirilgan yoki mentor tiklagan: undan oldin berilgan barcha sessiyalar bekor bo'ladi
  if ((user.sessionVersion ?? 0) !== (session.sessionVersion ?? 0)) return null;

  // Cookie uzoq yashaydi — "parolni almashtirish shart" belgisi ham bazadagi holatdan olinadi
  const mustChangePassword = Boolean(user.mustChangePassword);
  if (session.role !== "student") return { ...session, mustChangePassword };
  return { ...session, mustChangePassword, groupId: user.groupId ? user.groupId.toString() : null };
});

/**
 * Require valid session, otherwise redirect to /login
 */
export async function requireAuth(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  // Vaqtinchalik parol bilan kirgan foydalanuvchi parolini almashtirmaguncha hech qaysi sahifa va amalga o'tolmaydi
  if (user.mustChangePassword) {
    redirect("/change-password");
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
