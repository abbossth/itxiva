import crypto from "crypto";

// Vaqtinchalik (mentor bergan, o'quvchi hali o'zgartirmagan) parollar mentor qayta ko'ra olishi uchun
// AES-256-GCM bilan shifrlab saqlanadi. O'quvchi o'z parolini qo'ygach bu qiymat o'chiriladi —
// o'quvchi qo'ygan parol faqat bcrypt xesh sifatida turadi va uni hech kim o'qiy olmaydi.

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET muhit o'zgaruvchisi aniqlanmagan");
    }
    return crypto.createHash("sha256").update("itxiva-development-temp-password-key").digest();
  }
  return crypto.createHash("sha256").update(`${secret}:temp-password`).digest();
}

export function encryptTempPassword(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptTempPassword(payload?: string | null): string | null {
  if (!payload) return null;
  try {
    const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
