import { addDays, byOrder, suggestions, toHM, toMin, type Block, type DayEvent, type Task } from "./planning.ts";

export interface FullTask extends Task {
  source: string;
  external_id: string | null;
  tags: string[];
  link: string | null;
  note: string | null;
  description: string | null;
}
export interface DayRow { date: string; headline: string | null; events: DayEvent[] }
export interface State { tasks: FullTask[]; days: DayRow[]; blocks: Block[] }

const compact = (t: FullTask) =>
  Object.fromEntries(
    Object.entries({
      id: t.id, title: t.title, due: t.due, time: t.time, priority: t.priority, estimate_mins: t.estimate_mins,
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
    tasks: {
      carried: open.filter((t) => t.due < o.today).map(compact),
      due: open.filter((t) => t.due >= o.today && t.due <= o.date).map(compact),
      upcoming: open.filter((t) => t.due > o.date && t.due >= o.today).map(compact),
      done: o.tasks.filter((t) => t.done && t.done_on === o.date && match(t)).map((t) => ({ id: t.id, title: t.title })),
    },
    plan,
    planned_mins: plan.reduce((n, b) => n + b.mins, 0),
    suggestions: suggestions({ date: o.date, today: o.today, nowM: o.nowM, tasks: o.tasks, blocks: o.blocks })
      .map((s) => ({ id: s.task.id, title: s.task.title, reasons: s.reasons })),
  };
}
