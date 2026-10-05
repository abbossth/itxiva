import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { UserRole } from "@/lib/db/models/user.model";

const COOKIE_NAME = "itxiva_session";
const SESSION_DURATION_SECONDS = 14 * 24 * 60 * 60; // 14 days

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Productionda ma'lum bo'lgan zaxira kalit bilan ishlash sessiyalarni soxtalashtirishga yo'l ochadi
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET muhit o'zgaruvchisi aniqlanmagan");
    }
    return new TextEncoder().encode("itxiva-development-secret-key-at-least-32-characters-long!");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  login: string;
  fullName: string;
  role: UserRole;
  groupId: string | null;
  mustChangePassword: boolean;
}

/**
 * Sign a JWT token with session payload
 */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getJwtSecret());
}

/**
 * Verify and decode JWT token
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      userId: payload.userId as string,
      login: payload.login as string,
      fullName: payload.fullName as string,
      role: payload.role as UserRole,
      groupId: (payload.groupId as string) || null,
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  } catch {
    return null;
  }
}

/**
 * Set HTTP-only session cookie
 */
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

/**
 * Get current session from cookie
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(COOKIE_NAME);
  if (!sessionCookie?.value) {
    return null;
  }
  return verifySessionToken(sessionCookie.value);
}

/**
 * Delete session cookie on logout
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
