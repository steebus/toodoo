// A docket on the phone: swipe right to bump it, swipe left to reveal Plan / Tomorrow.
// Distances in px of travel, velocity in px/s (motion's pan info).
export const SWIPE = {
  tick: 96, // right past this bumps
  open: 56, // left past this opens the actions
  rest: 168, // where the paper rests while they are open
  flick: 600, // a fast flick counts from a shorter travel
  flickMin: 32,
};

export type SwipeEnd = "tick" | "open" | "close";

// Where the paper goes when the finger lifts, from where it is (x) and how fast it was moving (vx).
// A fling decides by its direction; otherwise where the paper was let go.
export function swipeEnd(x: number, vx: number): SwipeEnd {
  if (vx >= SWIPE.flick) return x >= SWIPE.flickMin ? "tick" : "close";
  if (vx <= -SWIPE.flick) return x <= -SWIPE.flickMin ? "open" : "close";
  return x >= SWIPE.tick ? "tick" : x <= -SWIPE.open ? "open" : "close";
}

// A short buzz where the device can; silently nothing elsewhere.
export function buzz(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not allowed here: no haptics */
  }
}

// A Board card on the phone: swiped sideways, it moves a column per step of travel (right is on, left is back).
export const COLUMN_SWIPE = { first: 56, step: 64 };

// The column a card swiped to x would land in, from column `from` of `count`: as far as it was pulled, never off the ends.
export function columnAt(x: number, from: number, count: number): number {
  const d = Math.abs(x);
  const n = d < COLUMN_SWIPE.first ? 0 : 1 + Math.floor((d - COLUMN_SWIPE.first) / COLUMN_SWIPE.step);
  return Math.max(0, Math.min(count - 1, from + Math.sign(x) * n));
}

// A suggestion on the phone: swiped right it is accepted, swiped left rejected; let go short of either and it springs back.
export const SUGGEST_SWIPE = { commit: 110, flick: 600, flickMin: 40 };

export type SuggestEnd = "accept" | "reject" | null;

// What a suggestion swiped to x (px) and let go at vx (px/s) decides: a fling counts from a shorter travel.
export function suggestEnd(x: number, vx: number): SuggestEnd {
  if (vx >= SUGGEST_SWIPE.flick && x >= SUGGEST_SWIPE.flickMin) return "accept";
  if (vx <= -SUGGEST_SWIPE.flick && x <= -SUGGEST_SWIPE.flickMin) return "reject";
  return x >= SUGGEST_SWIPE.commit ? "accept" : x <= -SUGGEST_SWIPE.commit ? "reject" : null;
}
