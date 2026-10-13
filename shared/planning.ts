// Pure planning logic shared by the web app and Convex functions. No package imports: must run in Deno and Vite.
import { effectivePriority, epicWeight, STATUS_WEIGHT, TASK_WEIGHT, type Epic, type TaskStatus } from "./epics.ts";

export const TZ = "Australia/Brisbane"; // ponytail: hard-coded TZ, move to a user setting if multi-user
// Blocks start and run in 5-minute steps, 5 minutes at least: a quick win can be that short. Picking a slot on the
// line (a click, the keyboard cursor) goes by 15-minute SLOTs.
export const SNAP = 5;
export const SLOT = 15;
export const DAY_START = 6 * 60;
export const DAY_END = 22 * 60;

export type Priority = "high" | "med" | "low";
export interface Task {
  id: string;
  title: string;
  due: string;
  time: string | null;
  priority: Priority | null;
  estimate_mins: number | null;
  done: boolean;
  done_on: string | null;
  sort_order: number;
  epic_id?: string | null;
  status?: TaskStatus;
}
// A slot on a day's line. A task can have several in one day (deep work split around meetings); each counts.
export interface Block { id?: string; task_id: string; date: string; start: string; mins: number }
export interface DayEvent { start?: string; end?: string; title?: string; where?: string; allDay?: boolean }
export interface Span { s: number; e: number }

const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const shortFmt = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
const asDate = (d: string) => new Date(d + "T12:00:00+10:00");

export const ymd = (d: Date) => ymdFmt.format(d);
export const today = (now = new Date()) => ymd(now);
export const toMin = (hm?: string | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm ?? "");
  return m ? +m[1] * 60 + +m[2] : null;
};
export const nowMin = (now = new Date()) => toMin(hmFmt.format(now))!;
export const addDays = (d: string, n: number) => ymd(new Date(asDate(d).getTime() + n * 864e5));
export const daysBetween = (a: string, b: string) => Math.round((asDate(b).getTime() - asDate(a).getTime()) / 864e5);
export const toHM = (n: number) => {
  n = Math.max(0, Math.min(24 * 60 - 1, Math.round(n)));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
export const snapUp = (n: number) => Math.ceil(n / SNAP) * SNAP;
export const fmtTime = (hm?: string | null) => {
  const n = toMin(hm);
  if (n == null) return "";
  const h = Math.floor(n / 60), m = n % 60, ap = h >= 12 ? "pm" : "am", h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}`;
};
export const dayWord = (d: string, t: string) =>
  d === t ? "today" : d === addDays(t, 1) ? "tomorrow" : d === addDays(t, -1) ? "yesterday" : shortFmt.format(asDate(d));

// "90", "45m", "1.5h", "1h30", "1h 30m", "1:15" → minutes; null when empty; NaN when unparseable.
export function parseDuration(input?: string | null): number | null {
  const s = String(input ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = /^(\d+(?:\.\d+)?)$/.exec(s);
  if (m) return Math.round(+m[1]);
  m = /^(\d+):(\d{2})$/.exec(s);
  if (m) return +m[1] * 60 + +m[2];
  m = /^(?:(\d+(?:\.\d+)?)h(?:rs?|ours?)?)?(?:(\d+)(?:m(?:in(?:s|utes?)?)?)?)?$/.exec(s);
  if (m && (m[1] || m[2])) return Math.round(+(m[1] ?? 0) * 60 + +(m[2] ?? 0));
  return NaN;
}
export const formatDuration = (mins: number) => {
  const m = Math.round(mins || 0), h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};
export const byOrder = (a: { id: string; sort_order: number }, b: { id: string; sort_order: number }) =>
  a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function effortMap(blocks: Block[], t: string, nowM: number) {
  const map = new Map<string, { planned: number; actual: number; days: Set<string> }>();
  for (const b of blocks) {
    const e = map.get(b.task_id) ?? { planned: 0, actual: 0, days: new Set<string>() };
    map.set(b.task_id, e);
    e.planned += b.mins;
    e.days.add(b.date);
    if (b.date < t) e.actual += b.mins;
    else if (b.date === t) e.actual += Math.max(0, Math.min(b.mins, nowM - (toMin(b.start) ?? 0)));
  }
  return map;
}

// Remaining estimate (at least 5m, at most 4h) when there is one, otherwise 1h for high priority and 30m for the
// rest. A quick win (a 10-minute job) takes its 10 minutes, so several queue back to back.
export function defaultBlockMins(task: Pick<Task, "priority" | "estimate_mins">, planned = 0): number {
  const est = task.estimate_mins ?? 0;
  if (est) {
    const left = est - planned;
    if (left > 0) return Math.min(240, Math.max(SNAP, snapUp(left))); // 5m at least: a quick win takes what it needs
  }
  return task.priority === "high" ? 60 : 30;
}

export interface Suggestion { task: Task; score: number; reasons: string[] }

// Weights ported 1:1 from the original planner artifact.
export function suggestions(o: {
  date: string; today: string; nowM: number; tasks: Task[]; blocks: Block[]; limit?: number; epics?: Epic[];
}): Suggestion[] {
  const { date, today: t, tasks, blocks } = o;
  const epics = new Map((o.epics ?? []).map((e) => [e.id, e]));
  if (date < t) return [];
  const eff = effortMap(blocks, t, o.nowM);
  const prevDate = [...new Set(blocks.filter((b) => b.date < date).map((b) => b.date))].sort().pop();
  const prevIds = new Set(blocks.filter((b) => b.date === prevDate).map((b) => b.task_id));
  const plannedOn = (id: string, d: string) => blocks.some((b) => b.task_id === id && b.date === d);
  const nextPlanned = (id: string) => blocks.filter((b) => b.task_id === id && b.date >= t).map((b) => b.date).sort()[0];
  const out: Suggestion[] = [];
  for (const task of tasks) {
    if (task.done || plannedOn(task.id, date)) continue;
    const epic = task.epic_id ? epics.get(task.epic_id) : undefined;
    let score = 0;
    const reasons: string[] = [];
    if (prevDate && prevIds.has(task.id)) { score += 3; reasons.push(`unfinished from ${dayWord(prevDate, t)}'s plan`); }
    if (task.due < t) {
      const n = daysBetween(task.due, t);
      score += 2 + Math.min(n, 7) / 7;
      reasons.push(n === 1 ? "due yesterday" : `overdue ${n}d`);
    } else if (task.due === date) { score += 2.2; reasons.push(date === t ? "due today" : "due that day"); }
    else if (task.due < date) { score += 1.5; reasons.push(`due ${dayWord(task.due, t)}`); }
    else if (!prevIds.has(task.id) && effectivePriority(task, epic) !== "high") continue;
    else { score -= 1; reasons.push(`due ${dayWord(task.due, t)}`); }
    score += TASK_WEIGHT[task.priority ?? "none"];
    if (task.priority === "high") reasons.push("high priority");
    else if (task.priority === "med") reasons.push("med priority");
    if (epic) {
      score += epicWeight(epic);
      if (epic.status === "on_hold") reasons.push(`${epic.title} on hold`);
      else if (epic.priority === "high" || epic.priority === "med") reasons.push(`${epic.priority} epic: ${epic.title}`);
    }
    if (task.status && task.status !== "todo") {
      score += STATUS_WEIGHT[task.status];
      reasons.push(task.status === "doing" ? "in progress" : "blocked");
    }
    const e = eff.get(task.id);
    if (task.estimate_mins && e && e.planned >= task.estimate_mins) { score -= 1.5; reasons.push("estimate already planned"); }
    const other = nextPlanned(task.id);
    if (other && other !== date) { score -= 2; reasons.push(`planned ${dayWord(other, t)}`); }
    if (task.time && task.due === date) { score += 1; reasons.unshift(`at ${fmtTime(task.time)}`); }
    out.push({ task, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || byOrder(a.task, b.task)).slice(0, o.limit ?? 5);
}

export function timedEvents(events: DayEvent[]) {
  return events.flatMap((ev) => {
    if (ev.allDay) return [];
    const s = toMin(ev.start);
    if (s == null) return [];
    return [{ s, e: Math.max(toMin(ev.end) ?? s + 30, s + SNAP), title: ev.title || "Untitled", where: ev.where }];
  });
}

export function busySpans(events: DayEvent[], blocks: Block[], date: string, exceptTaskId?: string): Span[] {
  const planned = blocks
    .filter((b) => b.date === date && b.task_id !== exceptTaskId)
    .map((b) => { const s = toMin(b.start) ?? 0; return { s, e: s + b.mins }; });
  return [...timedEvents(events).map(({ s, e }) => ({ s, e })), ...planned].sort((x, y) => x.s - y.s);
}

export function firstFree(mins: number, from: number, busy: Span[], dayStart = DAY_START): number {
  let s = snapUp(Math.max(from, dayStart));
  for (const b of busy) {
    if (b.e <= s) continue;
    if (b.s >= s + mins) break;
    s = snapUp(Math.max(s, b.e));
  }
  return s;
}

export interface ProposedBlock { task_id: string; title: string; start: string; mins: number }
export interface Unplaced { task_id: string; title: string; reason: string }

export function autoPlan(o: {
  date: string; today: string; nowM: number; tasks: Task[]; events: DayEvent[]; blocks: Block[];
  from?: number; until?: number; taskIds?: string[]; epics?: Epic[];
  mins?: number; // each block this long (snapped), instead of what is left of the estimate
}): { proposed: ProposedBlock[]; unplaced: Unplaced[] } {
  const byId = new Map(o.tasks.map((t) => [t.id, t]));
  const ranked = o.taskIds
    ? o.taskIds.map((id) => byId.get(id)).filter((t): t is Task => !!t && !t.done) // repeats welcome: one block each
    : suggestions({ ...o, limit: 20 }).map((s) => s.task);
  const proposed: ProposedBlock[] = [];
  const unplaced: Unplaced[] = [];
  const skip = (t: Task, reason: string) => unplaced.push({ task_id: t.id, title: t.title, reason });
  if (o.date < o.today) {
    ranked.forEach((t) => skip(t, "that day is in the past"));
    return { proposed, unplaced };
  }
  const floor = o.date === o.today ? snapUp(o.nowM + 5) : 0;
  const from = Math.max(o.from ?? (o.date === o.today ? floor : 9 * 60), floor);
  const until = Math.min(o.until ?? DAY_END, 24 * 60);
  // Fixed-time tasks claim their slot first so flexible ones flow around them.
  const isFixed = (t: Task) => { const f = t.due === o.date ? toMin(t.time) : null; return f != null && f >= from && f < until; };
  const candidates = [...ranked.filter(isFixed), ...ranked.filter((t) => !isFixed(t))];
  const eff = effortMap(o.blocks, o.today, o.nowM);
  const placed = o.blocks.filter((b) => b.date === o.date);
  // A task asked for again (listed twice, or already on the line) gets another block: every block counts toward its
  // estimate, so each new one sizes to what is left.
  const more = new Map<string, number>();
  for (const t of candidates) {
    const before = (eff.get(t.id)?.planned ?? 0) + (more.get(t.id) ?? 0);
    const mins = o.mins ? Math.max(SNAP, Math.min(240, snapUp(o.mins))) : defaultBlockMins(t, before);
    const fixed = t.due === o.date ? toMin(t.time) : null;
    const s = fixed != null && fixed >= from && fixed + mins <= until
      ? fixed
      : firstFree(mins, from, busySpans(o.events, placed, o.date));
    if (s + mins > until) { skip(t, "no room in that window"); continue; }
    placed.push({ task_id: t.id, date: o.date, start: toHM(s), mins });
    proposed.push({ task_id: t.id, title: t.title, start: toHM(s), mins });
    more.set(t.id, (more.get(t.id) ?? 0) + mins);
  }
  return { proposed, unplaced };
}

// Side-by-side columns for overlapping timeline items.
export function layoutLanes<T extends Span>(items: T[]): (T & { col: number; cols: number })[] {
  const out = items.map((it) => ({ ...it, col: 0, cols: 1 })).sort((x, y) => x.s - y.s || (y.e - y.s) - (x.e - x.s));
  let cluster: typeof out = [];
  let end = -1;
  const flush = () => {
    const cols: number[] = [];
    for (const it of cluster) {
      let c = cols.findIndex((e) => e <= it.s);
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = it.e;
      it.col = c;
    }
    for (const it of cluster) it.cols = cols.length;
    cluster = [];
  };
  for (const it of out) {
    if (it.s >= end && cluster.length) flush();
    cluster.push(it);
    end = Math.max(end, it.e);
  }
  if (cluster.length) flush();
  return out;
}
