// The Eisenhower matrix's geometry: where a task sits, and back again for a drag. x runs urgent (left) to later
// (right) from the due date; y runs important (top) to not (bottom) from the priority, in four bands.
import { addDays, daysBetween, type Priority } from "@shared/planning.ts";

// Urgency: due within URGENT_DAYS lands left of the middle. A soft curve, so the near days get the room
// (overdue piles up at the left edge, a month out at the right).
const URGENT_DAYS = 2.5;
const SPREAD = 10;
const EDGE = 0.03;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const urgencyX = (due: string, today: string) =>
  clamp(0.5 + 0.5 * Math.tanh((daysBetween(today, due) - URGENT_DAYS) / SPREAD), EDGE, 1 - EDGE);
// The due date for an x: the inverse, to the whole day.
export const dueAt = (x: number, today: string) =>
  addDays(today, Math.round(URGENT_DAYS + SPREAD * Math.atanh(clamp(2 * x - 1, -0.999, 0.999))));

// Importance: high and med above the middle, none and low below.
export const BANDS: (Priority | null)[] = ["high", "med", null, "low"];
export const bandY = (p: Priority | null) => (BANDS.indexOf(p) + 0.5) / BANDS.length;
export const priorityAt = (y: number): Priority | null => BANDS[clamp(Math.floor(y * BANDS.length), 0, BANDS.length - 1)];

// A dot's radius from the minutes still to do (estimate less time spent), never smaller than the least.
export const MIN_R = 6;
export const radius = (est: number | null, spent = 0) => clamp(MIN_R + 2.2 * Math.sqrt(Math.max(0, (est ?? 0) - spent)), MIN_R, 34);

// A steady nudge per task, so tasks due the same day at the same priority spread out instead of hiding each other.
export function jitter(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 1000) / 1000, b = ((h >>> 10) % 1000) / 1000;
  return [(a - 0.5) * 0.03, (b - 0.5) * 0.17];
}
