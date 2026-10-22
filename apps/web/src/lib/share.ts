import type { SharedIn } from "@shared/share.ts";

// Something shared to toodoo lands on /share?url=&title=&text= (Android's share sheet through the manifest's
// share_target, or the bookmarklet with popup=1). It is kept in this tab's session storage straight away, so it
// survives a trip through sign-in (AuthKit comes back to /callback) and the share room picks it up after.
// Shared files wait in Cache Storage (public/share-sw.js put them there); files=N says how many.
const KEY = "toodoo.share";
const FILES = "toodoo-share"; // the cache share-sw.js keeps them in
export type Pending = SharedIn & { popup?: boolean; files?: number };

export function stashShare(loc: { pathname: string; search: string } = window.location) {
  if (loc.pathname !== "/share") return;
  const q = new URLSearchParams(loc.search);
  const p: Pending = {};
  for (const k of ["url", "title", "text"] as const) {
    const v = q.get(k)?.trim();
    if (v) p[k] = v.slice(0, k === "text" ? 4000 : 2000);
  }
  if (q.get("popup") === "1") p.popup = true;
  const n = Number(q.get("files"));
  if (Number.isInteger(n) && n > 0) p.files = Math.min(n, 10);
  if (!p.url && !p.title && !p.text && !p.files) return;
  try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* the share room still reads the address */ }
}

export function pendingShare(): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Pending | null;
    return p && (p.url || p.title || p.text || p.files) ? p : null;
  } catch {
    return null;
  }
}

export function clearShare() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  try { void caches.delete(FILES).catch(() => {}); } catch { /* no Cache Storage */ }
}

// The shared files, as Files again (name and type kept); none when they've gone or there's no Cache Storage.
export async function sharedFiles(n: number): Promise<File[]> {
  try {
    const cache = await caches.open(FILES);
    const got = await Promise.all(Array.from({ length: n }, async (_, i) => {
      const r = await cache.match(`/shared-file/${i}`);
      if (!r) return null;
      const name = decodeURIComponent(r.headers.get("x-name") ?? "") || `shared-${i + 1}`;
      return new File([await r.blob()], name, { type: r.headers.get("content-type") ?? "" });
    }));
    return got.filter((f): f is File => !!f);
  } catch {
    return [];
  }
}

// The bookmarklet: the page's address and title, and whatever words are selected on it.
export const bookmarklet = (origin: string) =>
  `javascript:(()=>{const s=String(getSelection()).trim().slice(0,3000);window.open('${origin}/share?popup=1&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+(s?'&text='+encodeURIComponent(s):''),'toodoo-share','width=480,height=780')})()`;
