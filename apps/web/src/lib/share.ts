import type { SharedIn } from "@shared/share.ts";

// Something shared to toodoo lands on /share?url=&title=&text= (Android's share sheet through the manifest's
// share_target, or the bookmarklet with popup=1). It is kept in this tab's session storage straight away, so it
// survives a trip through sign-in (AuthKit comes back to /callback) and the share room picks it up after.
const KEY = "toodoo.share";
export type Pending = SharedIn & { popup?: boolean };

export function stashShare(loc: { pathname: string; search: string } = window.location) {
  if (loc.pathname !== "/share") return;
  const q = new URLSearchParams(loc.search);
  const p: Pending = {};
  for (const k of ["url", "title", "text"] as const) {
    const v = q.get(k)?.trim();
    if (v) p[k] = v.slice(0, k === "text" ? 4000 : 2000);
  }
  if (q.get("popup") === "1") p.popup = true;
  if (!p.url && !p.title && !p.text) return;
  try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* the share room still reads the address */ }
}

export function pendingShare(): Pending | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Pending | null;
    return p && (p.url || p.title || p.text) ? p : null;
  } catch {
    return null;
  }
}

export function clearShare() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// The bookmarklet: the page's address and title, and whatever words are selected on it.
export const bookmarklet = (origin: string) =>
  `javascript:(()=>{const s=String(getSelection()).trim().slice(0,3000);window.open('${origin}/share?popup=1&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+(s?'&text='+encodeURIComponent(s):''),'toodoo-share','width=480,height=780')})()`;
