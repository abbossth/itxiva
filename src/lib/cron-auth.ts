import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/** Cron so'rovi `Authorization: Bearer <CRON_SECRET>` sarlavhasi bilan kelgan bo'lishi shart */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
