import { addDays, effortMap, type Block } from "@shared/planning.ts";
import type { Epic } from "@shared/epics.ts";
import type { FullTask } from "@shared/snapshot.ts";

export type StatTask = FullTask & { created_on: string; touched_on: string };
export type Everything = {
  today: string; nowM: number; epics: Epic[]; tasks: StatTask[]; blocks: Block[];
  jira_open?: string[] | null; jira_synced_at?: number | null; // what Jira listed as open at the last sync, and when
};

export const dayRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

// Monday of the week a day falls in.
export const weekOf = (d: string) => addDays(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));

// Open at the end of each day (made by then, not yet done), and the scope (all made by then).
export function burndown(tasks: StatTask[], days: string[]) {
  return days.map((date) => {
    const made = tasks.filter((t) => t.created_on <= date);
    return { date, scope: made.length, open: made.filter((t) => !t.done || !t.done_on || t.done_on > date).length };
  });
}

export function countBy<T>(xs: T[], key: (x: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const x of xs) {
    const k = key(x);
    if (k != null) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// Minutes on the line per day: gone by (past blocks, and today's up to now) and still ahead.
export function plannedByDay(blocks: Block[], days: string[], today: string, nowM: number) {
  const ids = new Set(days);
  const m = new Map(days.map((d) => [d, { spent: 0, ahead: 0 }]));
  for (const b of blocks) {
    if (!ids.has(b.date)) continue;
    const gone = effortMap([b], today, nowM).get(b.task_id)!.actual;
    const e = m.get(b.date)!;
    e.spent += gone;
    e.ahead += b.mins - gone;
  }
  return days.map((date) => ({ date, ...m.get(date)! }));
}

// Each estimated task's estimate against time on the line (gone by), done tasks first: how good the guesses are.
export function budget(tasks: StatTask[], blocks: Block[], today: string, nowM: number) {
  const eff = effortMap(blocks, today, nowM);
  return tasks
    .filter((t) => t.estimate_mins)
    .map((t) => ({ task: t, est: t.estimate_mins!, actual: eff.get(t.id)?.actual ?? 0 }));
}

// Days from made to done, for tasks done.
export const leadDays = (t: StatTask) =>
  t.done && t.done_on ? Math.max(0, Math.round((Date.parse(t.done_on) - Date.parse(t.created_on)) / 864e5)) : null;

// Days in a row, back from today (or yesterday, if nothing is done yet today), with something done.
export function streak(doneDays: Set<string>, today: string) {
  let d = doneDays.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (doneDays.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// All tasks' search: every word must be found somewhere on the task (title, notes, description, checklist,
// tags, epic, source, link), any case.
export function haystack(t: FullTask, epic?: Epic) {
  return [t.title, t.note, t.description, t.link, t.source, t.external_id, epic?.title, ...t.tags, ...(t.checklist ?? []).map((c) => c.text)]
    .filter(Boolean).join("\n").toLowerCase();
}
export const matches = (hay: string, q: string) => q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
