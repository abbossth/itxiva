"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/guards";
import { consumeRateLimit, clearRateLimit, formatWait } from "@/lib/rate-limit-db";
import { loginSchema, changePasswordSchema } from "@/lib/validations/auth.schema";

export interface ActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** So'rov kelgan IP manzil (Vercel `x-forwarded-for` ning birinchi qiymatiga mijoz manzilini yozadi) */
async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function loginAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  const rawLogin = formData.get("login") as string;
  const rawPassword = formData.get("password") as string;

  const parsed = loginSchema.safeParse({ login: rawLogin, password: rawPassword });
  if (!parsed.success) {
    return {
      success: false,
      message: "Ma'lumotlar noto'g'ri kiritildi",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { login, password } = parsed.data;

  // Urinishlar bazada sanaladi (server nusxalari orasida umumiy):
  //  - bitta qurilmadan bitta loginga 5 ta — parolni taxmin qilishdan himoya;
  //  - bitta loginga jami 30 ta — turli manzillardan taxmin qilishdan himoya (begona odam o'quvchini 5 ta urinish bilan bloklab qo'ya olmaydi);
  //  - bitta manzildan jami 100 ta — butun sinf bitta maktab tarmog'idan kirishi mumkin, shuning uchun keng.
  const loginKey = login.toLowerCase();
  const ip = await getClientIp();
  const deviceKey = `login:${loginKey}:${ip}`;
  const limits = await Promise.all([
    consumeRateLimit(deviceKey, 5, LOGIN_WINDOW_MS),
    consumeRateLimit(`login:${loginKey}`, 30, LOGIN_WINDOW_MS),
    consumeRateLimit(`login-ip:${ip}`, 100, LOGIN_WINDOW_MS),
  ]);
  const blocked = limits.filter((l) => !l.allowed);
  if (blocked.length > 0) {
    const wait = Math.max(...blocked.map((l) => l.resetInSeconds));
    return {
      success: false,
      message: `Juda ko'p urinish. Iltimos, ${formatWait(wait)}dan keyin qayta urinib ko'ring`,
    };
  }

  await connectToDatabase();

  // Mentor talabi bilan xato aniq ko'rsatiladi: login topilmadimi yoki parol noto'g'rimi.
  // (Login mavjudligini taxmin qilishdan yuqoridagi urinishlar limiti himoya qiladi.)
  const user = await User.findOne({ login: loginKey });
  if (!user) {
    return {
      success: false,
      errors: { login: ["Login xato: bunday foydalanuvchi topilmadi"] },
    };
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    return {
      success: false,
      errors: { password: ["Parol xato"] },
    };
  }

  // To'g'ri kirgan qurilmaning hisoblagichi tozalanadi
  await clearRateLimit(deviceKey);

  // Update last login timestamp
  user.lastLoginAt = new Date();
  await user.save();

  // Set session cookie
  await setSessionCookie({
    userId: user._id.toString(),
    login: user.login,
    fullName: user.fullName,
    role: user.role,
    groupId: user.groupId ? user.groupId.toString() : null,
    mustChangePassword: Boolean(user.mustChangePassword),
    sessionVersion: user.sessionVersion ?? 0,
  });

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const rawNext = formData.get("next") as string | null;
  const safeNext =
    rawNext &&
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.includes("\\") &&
    !rawNext.startsWith("/api")
      ? rawNext
      : null;

  if (safeNext) {
    redirect(safeNext);
  }

  // Ikkala rol ham bosh sahifaga (dashboard) tushadi
  redirect("/");
}

/**
 * Parolni almashtirish. Ikki holat:
 *  - majburiy (vaqtinchalik parol bilan kirilgan): joriy parol so'ralmaydi, tugagach bosh sahifaga o'tiladi;
 *  - ixtiyoriy (profildan): joriy parol shart — ochiq qolgan qurilmadan hisobni egallab olishning oldini oladi.
 * Ikkalasida ham boshqa qurilmalardagi sessiyalar bekor bo'ladi.
 */
export async function changePasswordAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  // Bazada tekshirilgan sessiya: o'chirilgan yoki paroli tiklangan foydalanuvchining eski cookie'si o'tmaydi
  const session = await getCurrentUser();
  if (!session) {
    redirect("/login");
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword") ?? undefined,
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Parol talablarga javob bermaydi",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  await connectToDatabase();
  const user = await User.findById(session.userId);
  if (!user) {
    return {
      success: false,
      message: "Foydalanuvchi topilmadi",
    };
  }

  const wasForced = Boolean(user.mustChangePassword);
  if (!wasForced) {
    const rate = await consumeRateLimit(`pwd-change:${session.userId}`, 5, LOGIN_WINDOW_MS);
    if (!rate.allowed) {
      return {
        success: false,
        message: `Juda ko'p urinish. Iltimos, ${formatWait(rate.resetInSeconds)}dan keyin qayta urinib ko'ring`,
      };
    }
    const current = parsed.data.currentPassword;
    if (!current || !(await verifyPassword(current, user.passwordHash))) {
      return { success: false, errors: { currentPassword: ["Joriy parol noto'g'ri"] } };
    }
  }

  if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    return { success: false, errors: { newPassword: ["Yangi parol hozirgisidan farq qilishi kerak"] } };
  }

  user.passwordHash = await hashPassword(parsed.data.newPassword);
  user.mustChangePassword = false;
  // O'quvchi o'z parolini qo'ydi — mentor ko'ra oladigan vaqtinchalik parol endi yaroqsiz
  user.tempPasswordEnc = null;
  // Eski parol bilan ochilgan boshqa barcha sessiyalar (boshqa qurilmalar) yaroqsiz bo'ladi
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  await user.save();
  if (!wasForced) await clearRateLimit(`pwd-change:${session.userId}`);

  // Shu qurilma uchun yangi versiyadagi cookie
  await setSessionCookie({
    userId: user._id.toString(),
    login: user.login,
    fullName: user.fullName,
    role: user.role,
    groupId: user.groupId ? user.groupId.toString() : null,
    mustChangePassword: false,
    sessionVersion: user.sessionVersion,
  });

  if (wasForced) {
    // Ikkala rol ham bosh sahifaga (dashboard) tushadi
    redirect("/");
  }
  return { success: true, message: "Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi." };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
