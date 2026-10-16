import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { notifyFinishedExams, sendHomeworkDueReminders } from "@/lib/notifications/scheduled";
import { runGamificationCron } from "@/lib/gamification/cron";
import { retryFailedAiWork } from "@/lib/ai/retry";

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
    // Gamifikatsiya xatosi boshqa eslatmalarga ta'sir qilmasin
    const gamification = await runGamificationCron().catch((error) => {
      console.error("Gamification cron error:", error);
      return null;
    });
    // AI band bo'lgani uchun bajarilmay qolgan tekshiruvlar (vaqt chegarasi bilan)
    const aiRetry = await retryFailedAiWork({ budgetMs: 30_000 }).catch((error) => {
      console.error("AI retry cron error:", error);
      return null;
    });
    return NextResponse.json({ ok: true, homework, examsNotified: exams, gamification, aiRetry });
  } catch (error) {
    console.error("Daily cron error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
