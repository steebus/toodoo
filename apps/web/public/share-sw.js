/*
 * Files shared to toodoo, pulled into the PWA's service worker (vite.config.ts: workbox.importScripts).
 * Android's share sheet posts them to /share (the manifest's share_target); there is no server to take a post, so
 * they are kept here in Cache Storage and the share room is opened with the words as before and how many files wait
 * (lib/share.ts reads them back).
 */
const SHARE_CACHE = "toodoo-share";
const MAX_SHARED = 10;

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share") return;
  event.respondWith((async () => {
    const q = new URLSearchParams();
    try {
      const form = await event.request.formData();
      const files = form.getAll("files").filter((f) => typeof f !== "string" && f.size > 0).slice(0, MAX_SHARED);
      const cache = await caches.open(SHARE_CACHE);
      for (const k of await cache.keys()) await cache.delete(k);
      await Promise.all(files.map((f, i) => cache.put(`/shared-file/${i}`, new Response(f, {
        headers: { "content-type": f.type || "application/octet-stream", "x-name": encodeURIComponent(f.name || `shared-${i + 1}`) },
      }))));
      for (const k of ["url", "title", "text"]) {
        const v = form.get(k);
        if (typeof v === "string" && v.trim()) q.set(k, v);
      }
      if (files.length) q.set("files", String(files.length));
    } catch {
      // unreadable: the share room opens empty-handed rather than not at all
    }
    return Response.redirect(new URL(`/share?${q}`, self.location.origin).href, 303);
  })());
});
