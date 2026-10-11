import crypto from "crypto";

// Shaxsiy hujjat raqamlari (guvohnoma, pasport, JSHSHIR) bazada ochiq matnda turmaydi:
// AES-256-GCM bilan shifrlanadi. Kalit JWT_SECRET dan hosil qilinadi — sir almashtirilsa,
// eski qiymatlar o'qilmaydi (bo'sh ko'rinadi) va ularni qayta kiritish kerak bo'ladi.

function getKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET muhit o'zgaruvchisi aniqlanmagan");
    }
    return crypto.createHash("sha256").update("itxiva-development-field-key").digest();
  }
  return crypto.createHash("sha256").update(`${secret}:student-documents`).digest();
}

export function encryptField(plain: string): string | null {
  const value = plain.trim();
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptField(payload?: string | null): string {
  if (!payload) return "";
  try {
    const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
