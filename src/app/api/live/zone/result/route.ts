import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db/connect";
import { applyZoneResults } from "@/lib/live-game/zone-server";

// "Yashil zona" real vaqt xonasi (Cloudflare) to'lqin natijalarini shu yerga yuboradi — faqat to'g'ri HMAC imzo bilan
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ success: false, error: "Juda katta" }, { status: 413 });
  await connectToDatabase();
  const res = await applyZoneResults(raw, req.headers.get("x-arena-sig"));
  return NextResponse.json({ success: res.status === 200, error: res.error }, { status: res.status });
}
