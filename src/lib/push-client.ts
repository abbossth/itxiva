"use client";

// Brauzerda push obunasi: service worker (/sw.js) ro'yxatdan o'tadi, server kaliti bilan obuna bo'linadi va saqlanadi.

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";

/** Ruxsat berilgan bo'lsa — obunani yaratadi/yangilaydi va serverga yuboradi. true — push ishlayapti. */
export async function syncPush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const r = await fetch("/api/push", { cache: "no-store" });
    const j = (await r.json()) as { success: boolean; data?: { key: string | null } };
    const key = j.data?.key;
    if (!key) return false;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Tugma bosilganda: ruxsat so'raydi va obuna bo'ladi */
export async function enablePush(): Promise<NotificationPermission | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  const p = await Notification.requestPermission();
  if (p === "granted") await syncPush();
  return p;
}
