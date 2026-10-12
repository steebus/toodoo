// Pure timeline maths: the inverse of plan.ts's minutes -> px, the 15m snap, and the server's clamp.
import { SNAP, type Span } from "@shared/planning.ts";
import { BLOCK_LEAD, HOUR_PX, LABEL_Y } from "../ui/plan";

const DAY = 24 * 60;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const pxToMin = (y: number, startM: number) => startM + ((y - LABEL_Y) * 60) / HOUR_PX;
export const deltaMin = (dy: number) => (dy * 60) / HOUR_PX;
export const snap = (m: number) => Math.round(m / SNAP) * SNAP;

export type Placed = { start: number; mins: number };

// Exactly what placeBlock does on the server: start on the grid before 23:45, at least 15m, never past midnight.
export function clampBlock(start: number, mins: number): Placed {
  const s = clamp(snap(start), 0, DAY - SNAP);
  return { start: s, mins: clamp(snap(mins), SNAP, DAY - s) };
}

// A move keeps the block's length and slides it back inside the day instead of trimming it.
export function moveBlock(start: number, mins: number): Placed {
  const m = clamp(snap(mins), SNAP, DAY);
  return { start: clamp(snap(start), 0, DAY - m), mins: m };
}

// The slot a block would start in if its top edge were at y (blocks sit BLOCK_LEAD above their line).
export const hitSlot = (y: number, startM: number) =>
  clamp(Math.floor(pxToMin(y + BLOCK_LEAD, startM) / SNAP) * SNAP, 0, DAY - SNAP);

// Grow an hour range to whole hours so every span fits, within the day.
export function widenRange(startM: number, endM: number, spans: Span[]) {
  const lo = Math.min(startM, ...spans.map((x) => x.s));
  const hi = Math.max(endM, ...spans.map((x) => x.e));
  return { startM: Math.max(0, Math.floor(lo / 60) * 60), endM: Math.min(DAY, Math.ceil(hi / 60) * 60) };
}

// The hour the line opens on. The day's busy span (first block to last, and now) is centred in the view
// when it fits, rounded to the hour; when it does not, the line opens on the earlier of the first block's
// hour and the hour before now. Always within the drawn grid.
export function openHour(o: { startM: number; endM: number; spans: Span[]; nowM: number | null; viewMins: number }): number {
  const { startM, endM, spans, nowM, viewMins } = o;
  const edges = [...spans.flatMap((x) => [x.s, x.e]), ...(nowM !== null ? [nowM] : [])];
  if (!edges.length) return startM;
  const lo = Math.floor(Math.min(...edges) / 60) * 60;
  const hi = Math.ceil(Math.max(...edges) / 60) * 60;
  const top = hi - lo <= viewMins
    ? Math.round((lo - (viewMins - (hi - lo)) / 2) / 60) * 60
    : Math.floor(Math.min(lo, nowM !== null ? nowM - 60 : lo) / 60) * 60;
  return clamp(top, startM, Math.max(startM, endM - 60));
}

// Screen px in, comp px out: k is screen px per comp px (the frame's --u). A pointer drag of dy screen px
// moves (or, from the bottom edge, resizes) a block; a click offset px into the grid picks a slot.
export function dragBlock(b: { start: number; mins: number; mode: "move" | "resize" }, dy: number, k: number): Placed {
  const dm = deltaMin(dy / k);
  return b.mode === "move" ? moveBlock(b.start + dm, b.mins) : clampBlock(b.start, b.mins + dm);
}
export const slotAt = (offset: number, k: number, startM: number) => hitSlot(offset / k, startM);
