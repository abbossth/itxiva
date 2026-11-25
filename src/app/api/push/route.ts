import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { PushSubscription } from "@/lib/db/models/push-subscription.model";
import { pushPublicKey } from "@/lib/push";
import { checkRateLimit } from "@/lib/rate-limit";

// Push obunasi: GET — ochiq kalit, POST — obunani saqlash, DELETE — o'chirish
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ success: false }, 401);
  return json({ success: true, data: { key: pushPublicKey() } });
}

/** Faqat haqiqiy push xizmatlari (brauzer kompaniyalari) manzillari qabul qilinadi */
function validEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 1000) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /(^|\.)(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com|push\.apple\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return json({ success: false }, 401);
  if (!checkRateLimit(`push_sub_${user.userId}`, 10, 60_000).allowed) return json({ success: false, error: "Juda tez" }, 429);
  const b = (await req.json().catch(() => null)) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const p256dh = b?.keys?.p256dh;
  const auth = b?.keys?.auth;
  if (!b || !validEndpoint(b.endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return json({ success: false, error: "Noto'g'ri obuna" }, 400);
  }
  await connectToDatabase();
  // Bir qurilma — bitta egasi: boshqa akkauntga kirilsa, obuna yangi egaga o'tadi
  await PushSubscription.updateOne(
    { endpoint: b.endpoint },
    { $set: { userId: user.userId, keys: { p256dh, auth }, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300), failedAt: null } },
    { upsert: true }
  );
  // Bitta odamda ko'pi bilan 10 ta qurilma
  const extra = await PushSubscription.find({ userId: user.userId }).sort({ updatedAt: -1 }).skip(10).select("_id").lean();
  if (extra.length) await PushSubscription.deleteMany({ _id: { $in: extra.map((x) => x._id) } });
  return json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ success: false }, 401);
  const b = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof b?.endpoint !== "string") return json({ success: false }, 400);
  await connectToDatabase();
  await PushSubscription.deleteOne({ endpoint: b.endpoint, userId: user.userId });
  return json({ success: true });
}
