export type Action =
  | "add" | "down" | "up" | "tick" | "edit" | "plan" | "prevDay" | "nextDay" | "today"
  | "presetCapture" | "presetPlan" | "presetFocus" | "help";

const KEYS: Record<string, Action> = {
  n: "add", j: "down", k: "up", x: "tick", e: "edit", p: "plan", "[": "prevDay", "]": "nextDay", t: "today",
  "1": "presetCapture", "2": "presetPlan", "3": "presetFocus", "?": "help",
};

type Keyed = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & { target: EventTarget | null };

// Key to action; null when the key is not ours, a modifier is held, or the user is typing or in a dialog.
export function actionFor(e: Keyed): Action | null {
  const a = KEYS[e.key];
  if (!a || e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t?.closest?.("input, textarea, select, dialog, [contenteditable]:not([contenteditable=false])")) return null;
  if (t?.isContentEditable) return null;
  return typeof document !== "undefined" && document.querySelector("dialog[open]") ? null : a;
}
