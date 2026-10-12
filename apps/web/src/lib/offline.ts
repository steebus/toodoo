import { useSyncExternalStore } from "react";
import type { BoardData } from "../ui/types";

// Convex rides a WebSocket, so the service worker can't cache the board: keep the last good one per day here.
const KEY = "toodoo.board.";
const KEEP = 2;

type Saved = { at: number; board: BoardData };

export function saveBoard(key: string, board: BoardData, now = Date.now()) {
  try {
    localStorage.setItem(KEY + key, JSON.stringify({ at: now, board } satisfies Saved));
    const all = Object.keys(localStorage).filter((k) => k.startsWith(KEY)).map((k) => {
      try { return { k, at: (JSON.parse(localStorage.getItem(k) ?? "") as Saved).at }; } catch { return { k, at: 0 }; }
    }).sort((a, b) => b.at - a.at);
    for (const { k } of all.slice(KEEP)) localStorage.removeItem(k);
  } catch { /* storage full or blocked: offline reading just won't have it */ }
}

export function loadBoard(key: string): BoardData | undefined {
  try {
    const raw = localStorage.getItem(KEY + key);
    return raw ? (JSON.parse(raw) as Saved).board : undefined;
  } catch {
    return undefined;
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
