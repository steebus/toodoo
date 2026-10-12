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
