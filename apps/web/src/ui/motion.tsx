import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";

// One feel for the whole pass: springs that settle in about a third of a second, with a little give.
export const SPRING = { type: "spring", visualDuration: 0.3, bounce: 0.2 } as const;
export const SNAPPY = { type: "spring", visualDuration: 0.22, bounce: 0.3 } as const;

// The full feature set (layout animations) arrives in its own chunk after first paint. If that chunk cannot
// load (offline, or a stale hash after a deploy), the smaller set bundled here takes over: everything still
// lands on its final state, only layout moves are lost. Nothing waits on it to be visible: no element's
// first-paint state is hidden (initial={false} or CSS), so a slow chunk only delays motion, never content.
// Movement turns into fades under prefers-reduced-motion ("user"); layout animations stop.
const loadFeatures = () => import("./motionFeatures").then((r) => r.default, () => domAnimation);

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={SPRING}>{children}</MotionConfig>
    </LazyMotion>
  );
}

export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// While something is being dragged (a docket, the divider), layout animations hold still: dnd-kit and the
// pointer own those transforms. layoutDependency only re-measures when this value changes.
export const FreezeLayout = createContext(false);
export const useLayoutDependency = () => (useContext(FreezeLayout) ? "frozen" : undefined);

// Holds true for a beat after a drag ends, so the drop settles under dnd-kit before layout takes over again.
export function useLingering(on: boolean, ms = 320) {
  const [held, setHeld] = useState(on);
  useEffect(() => {
    if (on) return setHeld(true);
    const id = setTimeout(() => setHeld(false), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on || held;
}

// The celebration fires on the tick that bumps the day's last docket: same day, every docket done, and the
// done count went up (deleting the last open docket, or loading a finished day, is not a celebration).
export type Tally = { date: string; done: number; total: number };
export const finishedTheDay = (prev: Tally | null, next: Tally) =>
  !!prev && prev.date === next.date && next.total > 0 && next.done === next.total && next.done > prev.done && prev.done < prev.total;

// Dockets that were not on the board a moment ago and did not come from this device (the agent's morning
// drop, another device): they print in with a stagger. An optimistic docket swapped for its saved self is
// the same docket, not an arrival. A big catch-up (reconnecting, another device's backlog) is not news:
// more than MAX_ARRIVALS at once and none of them print in.
export const MAX_ARRIVALS = 5;
export function newArrivals(prev: ReadonlySet<string> | null, ids: string[], isLocal: (id: string) => boolean): string[] {
  if (!prev) return [];
  let swaps = [...prev].filter((id) => isLocal(id) && !ids.includes(id)).length;
  const out: string[] = [];
  for (const id of ids) {
    if (prev.has(id) || isLocal(id)) continue;
    if (swaps > 0) swaps--;
    else out.push(id);
  }
  return out.length > MAX_ARRIVALS ? [] : out;
}

const ARRIVAL_MS = 2400;

// id -> stagger position, for arrivals in the last couple of seconds.
export function useArrivals(ids: string[], isLocal: (id: string) => boolean): Map<string, number> {
  const seen = useRef<Set<string> | null>(null);
  const fresh = useRef(new Map<string, { i: number; at: number }>());
  const key = ids.join(",");
  const [, rerender] = useState(0);
  const prev = seen.current;
  if (prev === null || key !== [...prev].join(",")) {
    const now = Date.now();
    newArrivals(prev, ids, isLocal).forEach((id, i) => fresh.current.set(id, { i, at: now }));
    seen.current = new Set(ids);
  }
  useEffect(() => {
    if (!fresh.current.size) return;
    const id = setTimeout(() => rerender((n) => n + 1), ARRIVAL_MS);
    return () => clearTimeout(id);
  }, [key]);
  const now = Date.now();
  const out = new Map<string, number>();
  for (const [id, f] of fresh.current) {
    if (now - f.at < ARRIVAL_MS) out.set(id, f.i);
    else fresh.current.delete(id);
  }
  return out;
}

const CELEBRATE_MS = 2600;

// True for a moment after the day's last docket is bumped; a rollback (done < total again) ends it for good.
export function useCelebration(t: Tally): boolean {
  const prev = useRef<Tally | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (finishedTheDay(prev.current, t)) setAt(Date.now());
    else if (t.done < t.total) setAt(0); // rolled back: over, and a later delete must not bring it back
    prev.current = t;
  }, [t.date, t.done, t.total]); // eslint-disable-line react-hooks/exhaustive-deps -- the tally's fields are the deps
  useEffect(() => {
    if (!at) return;
    const id = setTimeout(() => setAt(0), CELEBRATE_MS);
    return () => clearTimeout(id);
  }, [at]);
  return at !== 0 && t.total > 0 && t.done === t.total;
}
