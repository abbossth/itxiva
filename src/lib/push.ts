import webpush from "web-push";
import { connectToDatabase } from "@/lib/db/connect";
import { PushSubscription } from "@/lib/db/models/push-subscription.model";

// Web Push: VAPID kalitlari /etc/itxiva/app.env da (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).
// Kalitlar bo'lmasa — push jimgina o'chiq (sayt ishlayveradi).

export interface PushPayload {
  title: string;
  body: string;
  /** Bosilganda ochiladigan sahifa (faqat sayt ichidagi yo'l) */
  url: string;
  /** Bir suhbatdan kelgan xabarlar bitta bildirishnomaga yig'iladi */
  tag?: string;
}

let configured: boolean | null = null;
function ready(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://www.itxiva.uz", pub, priv);
  return (configured = true);
}

export const pushPublicKey = () => (ready() ? process.env.VAPID_PUBLIC_KEY ?? null : null);

/** Foydalanuvchilarning barcha qurilmalariga yuboradi; eskirgan obunalar (404/410) o'chiriladi. Xatolar tashqariga chiqmaydi. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<number> {
  if (!ready() || userIds.length === 0) return 0;
  try {
    await connectToDatabase();
    const subs = await PushSubscription.find({ userId: { $in: userIds } }).select("endpoint keys").limit(500).lean();
    const body = JSON.stringify({ ...payload, url: payload.url.startsWith("/") ? payload.url : "/" });
    let sent = 0;
    const gone: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 3600, urgency: "high", topic: payload.tag?.slice(0, 32) });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(s.endpoint);
          else await PushSubscription.updateOne({ endpoint: s.endpoint }, { $set: { failedAt: new Date() } }).catch(() => {});
        }
      })
    );
    if (gone.length) await PushSubscription.deleteMany({ endpoint: { $in: gone } });
    return sent;
  } catch (err) {
    console.error("Push error:", err);
    return 0;
  }
}
