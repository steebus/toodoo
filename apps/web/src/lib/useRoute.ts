import { useCallback, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

// Five rooms on five paths. Anything else (including AuthKit's /callback) is the day.
export type Room = "day" | "board" | "epics" | "matrix" | "calendar" | "share" | "settings" | "stats" | "tasks" | "tidy" | "suggested";
export const ROOMS: { room: Room; path: string; label: string }[] = [
  { room: "day", path: "/", label: "Day" },
  { room: "board", path: "/board", label: "Board" },
  { room: "epics", path: "/epics", label: "Epics" },
  { room: "matrix", path: "/matrix", label: "Matrix" },
  { room: "calendar", path: "/calendar", label: "Calendar" },
];

// Share, Settings, Stats and All tasks are rooms off the nav (the menu has them); share is: where the share sheet
// and the bookmarklet land. /calendars, where calendars used to be added, is Settings now.
const PATHS: { room: Room; path: string }[] = [
  ...ROOMS, { room: "share", path: "/share" }, { room: "settings", path: "/settings" }, { room: "stats", path: "/stats" }, { room: "tasks", path: "/tasks" }, { room: "tidy", path: "/tidy" },
  { room: "suggested", path: "/suggested" }, { room: "settings", path: "/calendars" },
];

export const roomOf = (pathname: string): Room =>
  PATHS.find((r) => r.path !== "/" && (pathname === r.path || pathname.startsWith(r.path + "/")))?.room ?? "day";
export const pathOf = (room: Room) => PATHS.find((r) => r.room === room)!.path;

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

// The order rooms sit in, left to right: a page slides in from the side it sits on.
const ORDER: Room[] = [...ROOMS.map((r) => r.room), "tasks", "suggested", "tidy", "stats", "share", "settings"];

// Slides the page across under a header that stays put (a view transition, where the browser has them and motion
// is welcome), toward the side the new room sits on; update moves the app there.
function slide(from: Room, to: Room, update: () => void) {
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || still || from === to) return update();
  const root = document.documentElement;
  root.dataset.nav = ORDER.indexOf(to) < ORDER.indexOf(from) ? "back" : "forward";
  document.startViewTransition(() => flushSync(update)).finished.finally(() => delete root.dataset.nav);
}

// Going to a room: a new history entry, and the app told by a popstate of its own.
export function go(room: Room) {
  const path = pathOf(room);
  if (window.location.pathname === path) return;
  slide(roomOf(window.location.pathname), room, () => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

// The browser's own back and forward slide too. Their popstate (trusted, unlike the app's) is held here, before
// anything else hears it (this listener is added as the module loads, ahead of every component's), and replayed
// inside the slide, so the room and the day both change in its new frame. Not where the browser already drew its
// own (a swipe back on a phone).
let at: Room = typeof window === "undefined" ? "day" : roomOf(window.location.pathname);
if (typeof window !== "undefined") {
  window.addEventListener("popstate", (e) => {
    const from = at;
    at = roomOf(window.location.pathname);
    if (!e.isTrusted || from === at || (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) return;
    e.stopImmediatePropagation();
    slide(from, at, () => window.dispatchEvent(new PopStateEvent("popstate", { state: e.state })));
  });
}

export function useRoute(): [Room, (r: Room) => void] {
  const room = useSyncExternalStore(subscribe, () => roomOf(window.location.pathname), () => "day" as Room);
  return [room, useCallback(go, [])];
}
