import { useCallback, useSyncExternalStore } from "react";

// Three rooms on three paths. Anything else (including AuthKit's /callback) is the day.
export type Room = "day" | "board" | "epics";
export const ROOMS: { room: Room; path: string; label: string }[] = [
  { room: "day", path: "/", label: "Day" },
  { room: "board", path: "/board", label: "Board" },
  { room: "epics", path: "/epics", label: "Epics" },
];

export const roomOf = (pathname: string): Room =>
  ROOMS.find((r) => r.path !== "/" && (pathname === r.path || pathname.startsWith(r.path + "/")))?.room ?? "day";
export const pathOf = (room: Room) => ROOMS.find((r) => r.room === room)!.path;

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

export function go(room: Room) {
  const path = pathOf(room);
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useRoute(): [Room, (r: Room) => void] {
  const room = useSyncExternalStore(subscribe, () => roomOf(window.location.pathname), () => "day" as Room);
  return [room, useCallback(go, [])];
}
