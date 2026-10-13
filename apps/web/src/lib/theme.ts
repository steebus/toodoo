import { useCallback, useSyncExternalStore } from "react";

// Light, dark, or the system's ("auto"), per device. index.html applies it before first paint; this keeps it live.
export type Theme = "auto" | "light" | "dark";
const KEY = "toodoo.theme";
const EVENT = "toodoo-theme";

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(t: Theme, root = document.documentElement) {
  if (t === "auto") delete root.dataset.theme;
  else root.dataset.theme = t;
}

export function setTheme(t: Theme) {
  try {
    if (t === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* still applies for this visit */ }
  applyTheme(t);
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useTheme(): [Theme, (t: Theme) => void] {
  const t = useSyncExternalStore(subscribe, loadTheme, () => "auto" as Theme);
  return [t, useCallback(setTheme, [])];
}
