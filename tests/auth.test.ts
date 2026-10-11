import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { SignJWT } from "jose";
import { sessionDurationSeconds, signSessionToken, verifySessionToken } from "@/lib/auth/session";
import { changePasswordSchema, loginSchema } from "@/lib/validations/auth.schema";
import { decryptTempPassword, encryptTempPassword } from "@/lib/auth/temp-password";

describe("parol", () => {
  it("xesh qilingan parol faqat to'g'ri parol bilan mos keladi", async () => {
    const hash = await hashPassword("Sirli-parol-1");
    expect(hash).not.toContain("Sirli-parol-1");
    expect(await verifyPassword("Sirli-parol-1", hash)).toBe(true);
    expect(await verifyPassword("sirli-parol-1", hash)).toBe(false);
  });
});

describe("sessiya tokeni", () => {
  const payload = {
    userId: "6ac000000000000000000001",
    login: "ali_valiyev",
    fullName: "Ali Valiyev",
    role: "student" as const,
    groupId: "6ac000000000000000000002",
    mustChangePassword: false,
    sessionVersion: 3,
  };

  it("imzolangan token qayta o'qiladi", async () => {
    const token = await signSessionToken(payload);
    expect(await verifySessionToken(token)).toEqual(payload);
  });

  it("eski (versiyasiz) token 0-versiya deb o'qiladi", async () => {
    const { sessionVersion: _omit, ...legacy } = payload;
    void _omit;
    const token = await signSessionToken(legacy);
    expect((await verifySessionToken(token))?.sessionVersion).toBe(0);
  });

  it("o'zgartirilgan yoki begona token rad etiladi", async () => {
    const token = await signSessionToken(payload);
    const [header, body, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, role: "mentor" })).toString("base64url");
    expect(await verifySessionToken(`${header}.${forgedBody}.${signature}`)).toBeNull();
    expect(await verifySessionToken(`${header}.${body}.AAAA`)).toBeNull();
    expect(await verifySessionToken("bu-token-emas")).toBeNull();
  });
});

describe("kirish va parol almashtirish validatsiyasi", () => {
  it("qisqa login yoki parol qabul qilinmaydi", () => {
    expect(loginSchema.safeParse({ login: "ab", password: "1234" }).success).toBe(false);
    expect(loginSchema.safeParse({ login: "ali", password: "123" }).success).toBe(false);
    expect(loginSchema.safeParse({ login: "  ali_valiyev ", password: "1234" }).success).toBe(true);
  });

  it("yangi parollar bir xil bo'lishi shart", () => {
    expect(changePasswordSchema.safeParse({ newPassword: "yangi-parol", confirmPassword: "boshqa-parol" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ newPassword: "yangi-parol", confirmPassword: "yangi-parol" }).success).toBe(true);
  });
});

describe("vaqtinchalik parolni shifrlash", () => {
  it("shifrlangan parol ochiq ko'rinmaydi va qayta ochiladi", () => {
    const enc = encryptTempPassword("Vaqtincha-77");
    expect(enc).not.toContain("Vaqtincha-77");
    expect(decryptTempPassword(enc)).toBe("Vaqtincha-77");
  });

  it("buzilgan qiymat ochilmaydi", () => {
    const enc = encryptTempPassword("Vaqtincha-77");
    expect(decryptTempPassword(enc.slice(0, -4) + "AAAA")).toBeNull();
  });
});

describe("sessiya muddati", () => {
  const base = { userId: "u1", login: "ali", fullName: "Ali", groupId: null, mustChangePassword: false, sessionVersion: 0 };
  const sign = (role: string, ageSeconds: number) =>
    new SignJWT({ ...base, role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - ageSeconds)
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET || "itxiva-development-secret-key-at-least-32-characters-long!"));

  it("o'quvchi sessiyasi 1 kun, mentorniki 14 kun", () => {
    expect(sessionDurationSeconds("student")).toBe(24 * 60 * 60);
    expect(sessionDurationSeconds("mentor")).toBe(14 * 24 * 60 * 60);
  });

  it("1 kundan eski o'quvchi tokeni (eski, uzoq muddatli bo'lsa ham) yaroqsiz", async () => {
    expect(await verifySessionToken(await sign("student", 23 * 3600))).not.toBeNull();
    expect(await verifySessionToken(await sign("student", 25 * 3600))).toBeNull();
  });

  it("mentor tokeni 1 kundan keyin ham ishlaydi, 14 kundan keyin yo'q", async () => {
    expect(await verifySessionToken(await sign("mentor", 3 * 86400))).not.toBeNull();
    expect(await verifySessionToken(await sign("mentor", 15 * 86400))).toBeNull();
  });
});
