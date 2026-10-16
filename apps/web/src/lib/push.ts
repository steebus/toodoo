// This browser's side of due-date reminders: the service worker's push subscription (public/push-sw.js shows them).

export type PushState =
  | { at: "looking" }
  | { at: "unsupported" } // no service worker or push here (or not installed, on iOS)
  | { at: "blocked" } // notifications denied for the site
  | { at: "off" }
  | { at: "on"; endpoint: string };

type Sub = { endpoint: string; p256dh: string; auth: string };

const supported = () =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;

// The PWA's own registration (vite-plugin-pwa registers it); none in dev, where there is no worker to push to.
async function registration() {
  if (!supported()) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

// The key as the browser wants it: bytes, from URL-safe base64.
function keyBytes(base64: string) {
  const raw = atob((base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function pushDevice(): Promise<PushState> {
  try {
    const reg = await registration();
    if (!reg) return { at: "unsupported" };
    if (Notification.permission === "denied") return { at: "blocked" };
    const sub = await reg.pushManager.getSubscription();
    return sub ? { at: "on", endpoint: sub.endpoint } : { at: "off" };
  } catch {
    return { at: "unsupported" };
  }
}

// Ask, subscribe with the server's key, and file it; a subscription the server refused is dropped again.
export async function turnOn(key: () => Promise<string>, save: (s: Sub) => Promise<unknown>): Promise<PushState> {
  const reg = await registration();
  if (!reg) return { at: "unsupported" };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? { at: "blocked" } : { at: "off" };
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(await key()) }));
  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  try {
    await save({ endpoint: json.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" });
  } catch (e) {
    await sub.unsubscribe();
    throw e;
  }
  return { at: "on", endpoint: sub.endpoint };
}

export async function turnOff(forget: (endpoint: string) => Promise<unknown>): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await forget(sub.endpoint);
    await sub.unsubscribe();
  }
  return { at: "off" };
}
