import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendLessonReminders } from "@/lib/notifications/scheduled";
import { closeExpiredSessions } from "@/lib/attendance/core";
import { connectToDatabase } from "@/lib/db/connect";

// Har 5 daqiqada GitHub Actions chaqiradi (.github/workflows/lesson-reminders.yml):
// Vercel'ning bepul tarifida cron kuniga bir martadan ortiq ishlamaydi.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Ruxsat berilmagan" }, { status: 401 });
  }

  try {
    await connectToDatabase();
    // Mentor yopishni unutgan davomat sessiyalari shu yerda yopiladi
    const [lessons, closedSessions] = await Promise.all([sendLessonReminders(), closeExpiredSessions()]);
    return NextResponse.json({ ok: true, lessons, closedSessions });
  } catch (error) {
    console.error("Reminder cron error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
