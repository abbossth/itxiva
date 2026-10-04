import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Hash plaintext password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare plaintext password with bcrypt hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a cryptographically secure random alphanumeric password (8 chars)
 */
export function generateRandomPassword(length = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let result = "";
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}
