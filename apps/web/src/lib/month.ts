import { addDays, toMin, type Block, type DayEvent } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { weekOf } from "./stats";

// The Calendar room's month: whole weeks, Monday first, from the week the 1st falls in to the week the last day does.
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = addDays(`${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}-01`, -1);
  const out: string[] = [];
  for (let d = weekOf(first); d <= addDays(weekOf(last), 6); d = addDays(d, 1)) out.push(d);
  return out;
}

export const monthOf = (d: string) => d.slice(0, 7);
export function stepMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const k = y * 12 + (m - 1) + n;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
}
export const monthLabel = (month: string, short = false) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", month: short ? "short" : "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));

export type DayItem =
  | { kind: "event"; key: string; title: string; time: string | null; colour: string | null; allDay: boolean }
  | { kind: "task"; key: string; task: FullTask }
  | { kind: "plan"; key: string; task: FullTask; start: string; mins: number };

// A day's cell, top to bottom: all-day events, then the timed (events, plan blocks and tasks by time), then the tasks
// with only the date (high first, done last).
export function dayItems(date: string, events: DayEvent[], tasks: FullTask[], blocks: Block[] = []): DayItem[] {
  const ev = events.map((e, i): DayItem & { at: number } => ({
    kind: "event", key: `${date}-ev-${i}`, title: e.title || "Untitled", time: e.allDay ? null : e.start ?? null, colour: e.colour ?? null,
    allDay: !!e.allDay, at: e.allDay ? -1 : toMin(e.start) ?? -1,
  }));
  const tk = tasks.filter((t) => t.due === date).map((t): DayItem & { at: number } => ({ kind: "task", key: t.id, task: t, at: toMin(t.time) ?? 24 * 60 }));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const pl = blocks.filter((b) => b.date === date && byId.has(b.task_id)).map((b): DayItem & { at: number } => ({
    kind: "plan", key: `${date}-plan-${b.id ?? `${b.task_id}@${b.start}`}`, task: byId.get(b.task_id)!, start: b.start, mins: b.mins,
    at: toMin(b.start) ?? 0,
  }));
  const rank = (x: DayItem) => (x.kind === "task" ? (x.task.done ? 2 : x.task.priority === "high" ? 0 : 1) : 0);
  return [...ev, ...pl, ...tk]
    .sort((a, b) => a.at - b.at || rank(a) - rank(b) || (a.kind === "task" && b.kind === "task" ? a.task.sort_order - b.task.sort_order : 0))
    .map(({ at: _, ...x }) => x as DayItem);
}

// What a cell shows: everything, if it fits; else one fewer than fits, and "+n" for the rest.
export function fold<T>(items: T[], room: number): { shown: T[]; rest: T[] } {
  if (items.length <= room) return { shown: items, rest: [] };
  return { shown: items.slice(0, room - 1), rest: items.slice(room - 1) };
}
