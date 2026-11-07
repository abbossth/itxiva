import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendLessonReminders } from "@/lib/notifications/scheduled";
import { closeExpiredSessions } from "@/lib/attendance/core";
import { applyMissedHomeworkPenalties } from "@/lib/homework-penalties";
import { finishStaleLiveGames } from "@/lib/live-game/finish";
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
    // Muddati o'tgan uyga vazifalar: topshirmaganlarga jarima (xatosi boshqa ishlarga ta'sir qilmaydi)
    const homeworkPenalties = await applyMissedHomeworkPenalties().catch((error) => {
      console.error("Homework penalty error:", error);
      return null;
    });
    // Mentor yopishni unutgan jonli o'yinlar
    const liveGames = await finishStaleLiveGames().catch((error) => {
      console.error("Live game cron error:", error);
      return null;
    });
    return NextResponse.json({ ok: true, lessons, closedSessions, homeworkPenalties, liveGames });
  } catch (error) {
    console.error("Reminder cron error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
