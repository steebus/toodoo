export type Action =
  | "add" | "down" | "up" | "tick" | "edit" | "plan" | "prevDay" | "nextDay" | "today"
  | "presetPlan" | "presetCapture" | "focus" | "help" | "roomDay" | "roomBoard" | "roomEpics" | "roomMatrix";

// The rooms by their letters (D, K, E, M), the layout (P plan, C capture), F focus. On a focused ticket x ticks it
// and p puts it on the plan (the ticket handles those itself, before these).
const KEYS: Record<string, Action> = {
  n: "add", j: "down", ArrowDown: "down", ArrowUp: "up", x: "tick", r: "edit", "[": "prevDay", "]": "nextDay", t: "today",
  d: "roomDay", k: "roomBoard", e: "roomEpics", m: "roomMatrix",
  p: "presetPlan", c: "presetCapture", "1": "presetPlan", "2": "presetCapture", f: "focus", "?": "help",
};

// The room each room key goes to.
export const ROOM_KEYS = { roomDay: "day", roomBoard: "board", roomEpics: "epics", roomMatrix: "matrix" } as const;

type Keyed = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey"> & { target: EventTarget | null };

// Key to action; null when the key is not ours, a modifier is held, or the user is typing or in a dialog.
export function actionFor(e: Keyed): Action | null {
  const a = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!a || e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t?.closest?.("input, textarea, select, dialog, [contenteditable]:not([contenteditable=false])")) return null;
  if (t?.isContentEditable) return null;
  return typeof document !== "undefined" && document.querySelector("dialog[open]") ? null : a;
}
