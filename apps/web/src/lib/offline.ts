import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useConvexConnectionState } from "convex/react";
import type { BoardData } from "../ui/types";

// Convex rides a WebSocket, so the service worker can't cache the board: keep the last good one per user and day here.
const PREFIX = "toodoo.board.";
const USER = "toodoo.lastUser";
const KEEP = 2;
const DEAD_AFTER = 3000;

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

// Sign out: nothing of this person stays on the device.
export function clearCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
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

// No network, or a socket that has been down a few seconds after having connected (a blip doesn't count).
export function useOffline() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const c = useConvexConnectionState();
  const down = c.hasEverConnected && !c.isWebSocketConnected;
  const [dead, setDead] = useState(false);
  useEffect(() => {
    if (!down) return setDead(false);
    const t = setTimeout(() => setDead(true), DEAD_AFTER);
    return () => clearTimeout(t);
  }, [down]);
  return !online || dead;
}

// Read by the controls that write (docket tick, timeline), so they disable instead of vanishing.
export const OfflineContext = createContext(false);
export const useIsOffline = () => useContext(OfflineContext);
