"use server";

import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { setSessionCookie, clearSessionCookie, getSession } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema, changePasswordSchema } from "@/lib/validations/auth.schema";

export interface ActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Record<string, string[]>;
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

  // Rate limit by login identifier: 5 attempts per 15 minutes
  const rateLimitKey = `login_${login.toLowerCase()}`;
  const rateStatus = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  if (!rateStatus.allowed) {
    return {
      success: false,
      message: `Juda ko'p urinish. Iltimos, ${rateStatus.resetInSeconds} soniyadan keyin qayta urinib ko'ring`,
    };
  }

  await connectToDatabase();

  const user = await User.findOne({ login: login.toLowerCase() });
  if (!user) {
    return {
      success: false,
      message: "Login yoki parol noto'g'ri",
    };
  }

  const isPasswordValid = await verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    return {
      success: false,
      message: "Login yoki parol noto'g'ri",
    };
  }

  // Reset rate limit on successful credentials
  resetRateLimit(rateLimitKey);

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
  });

  if (user.mustChangePassword) {
    redirect("/change-password");
  }

  const rawNext = formData.get("next") as string | null;
  const safeNext =
    rawNext &&
    rawNext.startsWith("/") &&
    !rawNext.startsWith("//") &&
    !rawNext.startsWith("/api")
      ? rawNext
      : null;

  if (safeNext) {
    redirect(safeNext);
  }

  if (user.role === "mentor") {
    redirect("/mentor/groups");
  } else {
    redirect("/lessons");
  }
}

export async function changePasswordAction(
  prevState: unknown,
  formData: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const parsed = changePasswordSchema.safeParse({ newPassword, confirmPassword });
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

  const hashedPassword = await hashPassword(parsed.data.newPassword);
  user.passwordHash = hashedPassword;
  user.mustChangePassword = false;
  await user.save();

  // Re-issue session cookie with updated mustChangePassword=false
  await setSessionCookie({
    userId: user._id.toString(),
    login: user.login,
    fullName: user.fullName,
    role: user.role,
    groupId: user.groupId ? user.groupId.toString() : null,
    mustChangePassword: false,
  });

  if (user.role === "mentor") {
    redirect("/mentor/groups");
  } else {
    redirect("/lessons");
  }
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
