import type { Epic } from "./epics.ts";
import { addDays, byOrder, suggestions, toHM, toMin, type Block, type DayEvent, type Task } from "./planning.ts";

export interface FullTask extends Task {
  source: string;
  external_id: string | null;
  tags: string[];
  link: string | null;
  note: string | null;
  description: string | null;
  checklist?: ChecklistItem[];
}
export interface ChecklistItem { text: string; done: boolean }

// "2/5" for a checklist with items; null without.
export const checklistProgress = (c?: ChecklistItem[] | null) =>
  c?.length ? { done: c.filter((x) => x.done).length, total: c.length } : null;
export interface DayRow { date: string; headline: string | null; events: DayEvent[] }
export const WEEK_AHEAD = 3; // days past tomorrow in the snapshot's week

export interface State { tasks: FullTask[]; days: DayRow[]; blocks: Block[]; epics?: Epic[] }

const compact = (epics: Map<string, Epic>) => (t: FullTask) =>
  Object.fromEntries(
    Object.entries({
      id: t.id, title: t.title, due: t.due, time: t.time, priority: t.priority, estimate_mins: t.estimate_mins,
      epic: t.epic_id ? epics.get(t.epic_id)?.title : null, status: t.status && t.status !== "todo" ? t.status : null,
      checklist: t.checklist?.length ? t.checklist : null,
      tags: t.tags.length ? t.tags : null, source: t.source === "you" ? null : t.source, external_id: t.external_id,
      link: t.link, note: t.note,
    }).filter(([, v]) => v != null),
  );

export function buildSnapshot(o: { date: string; today: string; nowM: number; query?: string } & State) {
  const raw = o.query?.trim().toLowerCase() ?? "";
  const isTag = raw.startsWith("#");
  const q = isTag ? raw.slice(1) : raw;
  const match = (t: FullTask) =>
    !q || (isTag
      ? t.tags.some((x) => x.toLowerCase() === q)
      : [t.title, t.note, t.description, ...t.tags].some((x) => x?.toLowerCase().includes(q)));
  const open = o.tasks.filter((t) => !t.done && match(t)).sort(byOrder);
  const epics = new Map((o.epics ?? []).map((e) => [e.id, e]));
  const row = compact(epics);
  const titles = new Map(o.tasks.map((t) => [t.id, t.title]));
  const dayOf = (d: string) => o.days.find((x) => x.date === d) ?? null;
  const plan = o.blocks
    .filter((b) => b.date === o.date)
    .sort((a, b) => (toMin(a.start) ?? 0) - (toMin(b.start) ?? 0))
    .map((b) => ({ task_id: b.task_id, title: titles.get(b.task_id) ?? "(deleted)", start: toHM(toMin(b.start) ?? 0), mins: b.mins }));
  return {
    date: o.date,
    today: o.today,
    day: dayOf(o.date),
    next_day: dayOf(addDays(o.date, 1)),
    // the days after that, events only, so a look-ahead needs no more calls
    week: Array.from({ length: WEEK_AHEAD }, (_, i) => addDays(o.date, i + 2))
      .map((d) => ({ date: d, events: dayOf(d)?.events ?? [] })).filter((d) => d.events.length),
    tasks: {
      carried: open.filter((t) => t.due !== null && t.due < o.today).map(row),
      due: open.filter((t) => t.due !== null && t.due >= o.today && t.due <= o.date).map(row),
      upcoming: open.filter((t) => t.due !== null && t.due > o.date && t.due >= o.today).map(row),
      undated: open.filter((t) => t.due === null).map(row),
      done: o.tasks.filter((t) => t.done && t.done_on === o.date && match(t)).map((t) => ({ id: t.id, title: t.title })),
    },
    plan,
    planned_mins: plan.reduce((n, b) => n + b.mins, 0),
    // Done epics are left out; list_epics has them all.
    epics: (o.epics ?? []).filter((e) => e.status !== "done").map((e) => ({ id: e.id, title: e.title, priority: e.priority, status: e.status })),
    suggestions: suggestions({ date: o.date, today: o.today, nowM: o.nowM, tasks: o.tasks, blocks: o.blocks, epics: o.epics })
      .map((s) => ({ id: s.task.id, title: s.task.title, reasons: s.reasons })),
  };
}
