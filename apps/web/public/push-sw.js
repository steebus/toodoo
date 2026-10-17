/*
 * Due-date reminders, pulled into the PWA's service worker (vite.config.ts: workbox.importScripts).
 * The cron's round (convex/pushSend.ts) sends { title, body, url, tag }; a tap opens toodoo on that day.
 */
self.addEventListener("push", (event) => {
  let n = { title: "toodoo", body: "A task is due.", url: "/", tag: "due" };
  try {
    if (event.data) n = { ...n, ...event.data.json() };
  } catch {
    // not ours to read: the plain reminder stands
  }
  event.waitUntil(self.registration.showNotification(n.title, {
    body: n.body, tag: n.tag, renotify: true, icon: "/icon-192.png", badge: "/badge-96.png", data: { url: n.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of open) {
      if (new URL(c.url).origin === url.origin && "focus" in c) {
        await c.focus();
        if ("navigate" in c) await c.navigate(url.href);
        return;
      }
    }
    await self.clients.openWindow(url.href);
  })());
});
