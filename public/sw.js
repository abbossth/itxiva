// ITXiva service worker: faqat push-bildirishnomalar (sahifalarni keshlamaydi).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ITXiva", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil(
    (async () => {
      // Shu suhbat hozir ochiq va ko'rinib turgan bo'lsa — bildirishnoma shart emas
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (wins.some((w) => w.visibilityState === "visible" && w.focused && new URL(w.url).pathname + new URL(w.url).search === url)) return;
      await self.registration.showNotification(data.title || "ITXiva", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) await w.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
