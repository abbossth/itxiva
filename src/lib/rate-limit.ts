interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

/**
 * Clean up expired rate limit records periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60000).unref?.();

/**
 * Check and increment rate limit for a key
 * @param key unique identifier (e.g. login or IP)
 * @param maxAttempts maximum attempts allowed in the window (default 5)
 * @param windowMs window in milliseconds (default 15 minutes = 900,000 ms)
 */
export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000
): { allowed: boolean; remaining: number; resetInSeconds: number } {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetInSeconds: Math.ceil(windowMs / 1000) };
  }

  if (record.count >= maxAttempts) {
    const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  record.count += 1;
  const resetInSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  return { allowed: true, remaining: maxAttempts - record.count, resetInSeconds };
}

/**
 * Reset rate limit counter on successful login
 */
export function resetRateLimit(key: string): void {
  rateLimitMap.delete(key);
}
