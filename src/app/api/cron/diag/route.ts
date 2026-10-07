import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { isCronAuthorized } from "@/lib/cron-auth";
import { connectToDatabase } from "@/lib/db/connect";

// Tezlik diagnostikasi: funksiya qaysi regionda ishlayotgani va bazagacha bo'lgan kechikish.
// Faqat CRON_SECRET bilan chaqiriladi; maxfiy ma'lumot qaytarmaydi.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Ruxsat berilmagan" }, { status: 401 });
  }
  const t0 = performance.now();
  await connectToDatabase();
  const connectMs = Math.round(performance.now() - t0);

  const admin = mongoose.connection.db!.admin();
  const pings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await admin.command({ ping: 1 });
    pings.push(Math.round(performance.now() - t));
  }
  const hello = (await admin.command({ hello: 1 })) as { tags?: Record<string, string> };

  return NextResponse.json({
    functionRegion: process.env.VERCEL_REGION ?? "local",
    connectMs,
    pingMs: pings,
    dbTags: hello.tags ?? null,
  });
}
