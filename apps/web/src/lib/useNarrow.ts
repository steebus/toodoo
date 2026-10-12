import { useSyncExternalStore } from "react";

// The phone layout: bottom tabs, swipeable dockets, sheets. Matches the CSS breakpoint in pass.css.
export const NARROW = "(max-width: 819px)";

const query = () => (typeof window.matchMedia === "function" ? window.matchMedia(NARROW) : null);
const subscribe = (cb: () => void) => {
  const q = query();
  q?.addEventListener?.("change", cb);
  return () => q?.removeEventListener?.("change", cb);
};

export const isNarrow = () => !!query()?.matches;
export const useNarrow = () => useSyncExternalStore(subscribe, isNarrow, () => false);
