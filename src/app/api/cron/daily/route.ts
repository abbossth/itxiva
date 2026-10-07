import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { notifyFinishedExams, sendHomeworkDueReminders } from "@/lib/notifications/scheduled";

// Vercel Cron kuniga bir marta chaqiradi (vercel.json). Vercel so'rovga
// `Authorization: Bearer <CRON_SECRET>` sarlavhasini o'zi qo'shadi.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
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
