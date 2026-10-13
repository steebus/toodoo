import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useConvexConnectionState } from "convex/react";
import type { BoardData } from "../ui/types";

// Convex rides a WebSocket, so the service worker can't cache the board: keep the last good one per user and day here.
const PREFIX = "toodoo.board.";
const USER = "toodoo.lastUser";
const KEEP = 2;
const DEAD_AFTER = 3000;
const COLD_AFTER = 4000;

type Saved = { at: number; board: BoardData };
const keyOf = (user: string, date: string) => `${PREFIX}${user}.${date}`;

export function saveBoard(user: string, date: string, board: BoardData, now = Date.now()) {
  try {
    localStorage.setItem(keyOf(user, date), JSON.stringify({ at: now, board } satisfies Saved));
    const all = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).map((k) => {
      try { return { k, at: (JSON.parse(localStorage.getItem(k) ?? "") as Saved).at }; } catch { return { k, at: 0 }; }
    }).sort((a, b) => b.at - a.at);
    for (const { k } of all.slice(KEEP)) localStorage.removeItem(k);
  } catch { /* storage full or blocked: offline reading just won't have it */ }
}

export function loadBoard(user: string, date: string): BoardData | undefined {
  try {
    const raw = localStorage.getItem(keyOf(user, date));
    return raw ? (JSON.parse(raw) as Saved).board : undefined;
  } catch {
    return undefined;
  }
}

export const hasCachedBoard = (user: string) => {
  try { return Object.keys(localStorage).some((k) => k.startsWith(`${PREFIX}${user}.`)); } catch { return false; }
};

export const lastUser = () => { try { return localStorage.getItem(USER) ?? undefined; } catch { return undefined; } };
export const setLastUser = (id: string) => { try { localStorage.setItem(USER, id); } catch { /* ignore */ } };

// The Board and Epics rooms' data, kept the same way (one copy per person), so they open at once too.
const WORK = "toodoo.work.";
export function saveWork<T>(user: string, work: T) {
  try { localStorage.setItem(WORK + user, JSON.stringify(work)); } catch { /* storage full or blocked */ }
}
export function loadWork<T>(user: string): T | undefined {
  try {
    const raw = localStorage.getItem(WORK + user);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

// Sign out: nothing of this person stays on the device.
export function clearCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX) || k.startsWith(WORK)) localStorage.removeItem(k);
    localStorage.removeItem(USER);
  } catch { /* ignore */ }
}

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

// Once a cold start has waited that out, what mounts after it (the kept board) needn't wait again.
let coldDead = false;

// No network, or a socket down a few seconds (a blip doesn't count). A cold start that has never
// connected counts too, after a little longer: the radio can be on with no network behind it.
export function useOffline() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const c = useConvexConnectionState();
  const down = !c.isWebSocketConnected;
  const cold = !c.hasEverConnected;
  const [dead, setDead] = useState(() => down && cold && coldDead);
  useEffect(() => {
    if (!down) return setDead(false);
    if (cold && coldDead) return setDead(true);
    const t = setTimeout(() => {
      if (cold) coldDead = true;
      setDead(true);
    }, cold ? COLD_AFTER : DEAD_AFTER);
    return () => clearTimeout(t);
  }, [down, cold]);
  return !online || dead;
}

// No network at all (the device says so). Only then are writes held back: with a network, a socket that is
// down (the app was in the background and the phone closed it) comes back by itself, and Convex queues
// writes made meanwhile and sends them when it does.
export function useNoNetwork() {
  return !useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

// Read by the controls that write (docket tick, timeline), so they disable instead of vanishing.
export const OfflineContext = createContext(false);
export const useIsOffline = () => useContext(OfflineContext);
