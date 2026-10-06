import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { notifyFinishedExams, sendHomeworkDueReminders } from "@/lib/notifications/scheduled";

// Vercel Cron kuniga bir marta chaqiradi (vercel.json). Vercel so'rovga
// `Authorization: Bearer <CRON_SECRET>` sarlavhasini o'zi qo'shadi.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Ruxsat berilmagan" }, { status: 401 });
  }

  try {
    const [homework, exams] = await Promise.all([sendHomeworkDueReminders(), notifyFinishedExams()]);
    return NextResponse.json({ ok: true, homework, examsNotified: exams });
  } catch (error) {
    console.error("Daily cron error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
