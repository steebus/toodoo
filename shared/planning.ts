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
  due: string | null; // null: no due date (the default)
  time: string | null;
  priority: Priority | null;
  estimate_mins: number | null;
  done: boolean;
  done_on: string | null;
  sort_order: number;
  epic_id?: string | null;
  status?: TaskStatus;
  tags?: string[];
  source?: string;
  prep_for?: { date: string; start: string | null; title: string } | null; // the meeting it's prep for
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
export const hm = (d: Date) => hmFmt.format(d);
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
    // No due date: like a far-off one, suggested only when high or left over from the last plan.
    if (task.due === null) {
      if (!prevIds.has(task.id) && effectivePriority(task, epic) !== "high") continue;
      score -= 1;
    } else if (task.due < t) {
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
      reasons.push(task.status === "doing" ? "in progress" : task.status);
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

// ---------- auto plan: fill a day ----------

export const QUICK_WIN = 15; // a block this short or shorter is a quick win: they go together, early
const MIN_PART = 30; // a longer task takes part of its estimate when only a gap this big is left
const MIN_FOCUS = 45; // ...and a big one (an hour or more, or high priority) never less than this
const MIN_GAP = SNAP; // gaps shorter than this stay empty
const PREP_LEAD = 120; // prep goes in the two hours before its meeting
const SPREAD_FROM = 120; // a task with this much left, due within a week, gets a share a day instead of a crunch
const BATCH_LOOK = 3; // how far down the ranking a task of the same epic or source is pulled up beside one
const HISTORY = 28; // days of past plans read for slack
const MIN_SAMPLES = 3; // done tasks of a kind before their time is trusted as an estimate

export interface FillBlock extends ProposedBlock { why: string }
export interface FillOptions {
  from?: number; until?: number;
  keep?: boolean; // blocks already on the day stay (default); false: the ones ahead in the window are replaced
  buffer?: number; // minutes kept free after each meeting (default 10)
  lunch?: Span | null; // kept free (default 12:00–13:00); null: no lunch
  slack?: boolean; // fill only as much as past plans say gets done (default true)
  seed?: number; // Shuffle: near-equal tasks swap places; the same seed gives the same plan
  only?: string[]; // just these tasks
}
// Tasks done lately, read for slack and learned estimates.
export type DoneTask = Pick<Task, "id" | "done_on" | "epic_id" | "tags" | "source">;
export interface FillResult {
  date: string; from: string; until: string;
  proposed: FillBlock[];
  replaced: { task_id: string; start: string; mins: number }[]; // existing blocks taken off (when not keeping them)
  free_mins: number; // still empty in the window afterwards
  slack_mins: number; // of that, left free on purpose (past plans say this much doesn't get done)
  done_rate: number | null; // share of planned blocks done lately; null without enough history
}

// The free stretches of a window, around what's busy.
export function freeSpans(from: number, until: number, busy: Span[]): Span[] {
  const out: Span[] = [];
  let s = snapUp(from);
  for (const b of [...busy].sort((x, y) => x.s - y.s)) {
    if (b.e <= s) continue;
    if (b.s >= until) break;
    if (b.s - s >= MIN_GAP) out.push({ s, e: Math.min(b.s, until) });
    s = Math.max(s, snapUp(b.e));
  }
  if (until - s >= MIN_GAP) out.push({ s, e: until });
  return out.filter((x) => x.e - x.s >= MIN_GAP);
}

// How much a task matters on its own (its priority, its epic's, its column), for ranking ones brought forward.
const importance = (t: Task, epic?: Epic) =>
  TASK_WEIGHT[t.priority ?? "none"] + (epic ? epicWeight(epic) : 0) + (t.status && t.status !== "todo" ? STATUS_WEIGHT[t.status] : 0);
// A steady wobble per task for Shuffle, within about half a priority step, so only near-equals swap.
const jitter = (seed: number | undefined, id: string) => {
  if (!seed) return 0;
  let h = seed | 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
  return ((h >>> 0) / 2 ** 32 - 0.5) * 1.2;
};
// What a task is about, for keeping like with like: its epic, else where it came from.
const contextOf = (t: Task) => (t.epic_id ? `epic:${t.epic_id}` : t.source && t.source !== "you" ? `src:${t.source}` : null);

// How long a task without an estimate really takes, from the blocks of tasks done lately: by epic, tag, then source.
function learnedSizes(done: DoneTask[], blocks: Block[]) {
  const per = new Map<string, number>();
  for (const b of blocks) per.set(b.task_id, (per.get(b.task_id) ?? 0) + b.mins);
  const sums = new Map<string, { n: number; mins: number }>();
  for (const t of done) {
    const mins = per.get(t.id);
    if (!mins) continue;
    const keys = [t.epic_id && `epic:${t.epic_id}`, ...(t.tags ?? []).map((x) => `tag:${x}`), t.source && t.source !== "you" && `src:${t.source}`];
    for (const k of keys) {
      if (!k) continue;
      const v = sums.get(k) ?? { n: 0, mins: 0 };
      v.n++;
      v.mins += mins;
      sums.set(k, v);
    }
  }
  return (t: Task): { mins: number; like: string } | null => {
    const keys: [string, string][] = [
      ...(t.epic_id ? [[`epic:${t.epic_id}`, "this epic"] as [string, string]] : []),
      ...(t.tags ?? []).map((x): [string, string] => [`tag:${x}`, `#${x}`]),
      ...(t.source && t.source !== "you" ? [[`src:${t.source}`, t.source] as [string, string]] : []),
    ];
    for (const [k, like] of keys) {
      const v = sums.get(k);
      if (v && v.n >= MIN_SAMPLES) return { mins: Math.max(10, Math.min(180, snapUp(v.mins / v.n))), like };
    }
    return null;
  };
}

// Of the blocks planned lately, the share whose task was ticked by the next day.
export function doneRate(blocks: Block[], tasks: Pick<Task, "id" | "done_on">[], today: string): number | null {
  const doneOn = new Map<string, string>();
  for (const t of tasks) if (t.done_on) doneOn.set(t.id, t.done_on);
  const lo = addDays(today, -HISTORY);
  const past = blocks.filter((b) => b.date < today && b.date >= lo);
  if (past.length < 10) return null;
  const hit = past.filter((b) => { const d = doneOn.get(b.task_id); return d != null && d <= addDays(b.date, 1); }).length;
  return hit / past.length;
}

// Auto plan: fill a day's window with tasks.
// - Around events (and a buffer after each), lunch, and blocks already there unless keep is false.
// - Never Blocked, Backlog or an on-hold epic's work, nor a task planned on another day.
// - Prep goes in the two hours before its meeting. A task with a time that day takes it.
// - Then by rank: what's due or overdue (suggestions' order), with big tasks due this week taking a daily share; once
//   those run out, tasks from later days (soonest due first, then importance), then undated ones. Tasks of the same
//   epic or source sit together.
// - Quick wins (15m or less) go first so they sit together early; longer ones take the gaps they fit, or part of
//   their estimate (45m at least for a big one) when only a smaller gap is left.
// - With slack, it fills only as much of the free time as past plans say gets done.
export function fillDay(o: {
  date: string; today: string; nowM: number; tasks: Task[]; events: DayEvent[]; blocks: Block[]; epics?: Epic[]; done?: DoneTask[];
} & FillOptions): FillResult {
  const epics = new Map((o.epics ?? []).map((e) => [e.id, e]));
  const epicOf = (t: Task) => (t.epic_id ? epics.get(t.epic_id) : undefined);
  const keep = o.keep ?? true;
  const buffer = o.buffer ?? 10;
  const lunch = o.lunch === undefined ? { s: 12 * 60, e: 13 * 60 } : o.lunch;
  const floor = o.date === o.today ? snapUp(o.nowM + 5) : 0;
  const from = Math.max(o.from ?? 9 * 60, floor);
  const until = Math.min(o.until ?? 17 * 60, 24 * 60);
  const empty: FillResult = {
    date: o.date, from: toHM(from), until: toHM(Math.max(from, until)), proposed: [], replaced: [], free_mins: 0, slack_mins: 0, done_rate: null,
  };
  if (o.date < o.today || until <= from) return empty;

  // Not keeping: that day's blocks still ahead in the window come off (the past ones stay as they were).
  const onDay = o.blocks.filter((b) => b.date === o.date);
  const doomed = keep ? [] : onDay.filter((b) => { const s = toMin(b.start) ?? 0; return s >= from && s < until; });
  const blocks = o.blocks.filter((b) => !doomed.includes(b));
  const placed = blocks.filter((b) => b.date === o.date);
  const busy: Span[] = [
    ...timedEvents(o.events).map(({ s, e }) => ({ s, e: e + buffer })),
    ...placed.map((b) => { const s = toMin(b.start) ?? 0; return { s, e: s + b.mins }; }),
    ...(lunch ? [lunch] : []),
  ];
  let spans = freeSpans(from, until, busy);
  const freeAtStart = spans.reduce((n, x) => n + x.e - x.s, 0);

  const onLine = new Set(placed.map((b) => b.task_id));
  const elsewhere = new Set(blocks.filter((b) => b.date >= o.today && b.date !== o.date).map((b) => b.task_id));
  const eff = effortMap(blocks, o.today, o.nowM);
  const only = o.only && new Set(o.only);
  const open = o.tasks.filter((t) => !t.done && !onLine.has(t.id) && !elsewhere.has(t.id) && (!only || only.has(t.id))
    && t.status !== "blocked" && t.status !== "backlog" && epicOf(t)?.status !== "on_hold"
    && !(t.estimate_mins && (eff.get(t.id)?.planned ?? 0) >= t.estimate_mins));

  // Block sizes: what's left of the estimate; without one, what this kind of task has taken lately; for a big task
  // due within a week, a daily share of what's left.
  const learned = learnedSizes(o.done ?? [], o.blocks);
  const sized = new Map<string, { mins: number; note?: string; share?: boolean }>();
  const size = (t: Task) => {
    const hit = sized.get(t.id);
    if (hit) return hit;
    const planned = eff.get(t.id)?.planned ?? 0;
    let r: { mins: number; note?: string; share?: boolean } = { mins: defaultBlockMins(t, planned) };
    if (!t.estimate_mins) {
      const l = learned(t);
      if (l) r = { mins: l.mins, note: `~${formatDuration(l.mins)}, like ${l.like}` };
    }
    const left = t.estimate_mins ? t.estimate_mins - planned : 0;
    if (t.due && t.due > o.date && left >= SPREAD_FROM && daysBetween(o.date, t.due) <= 7) {
      const share = Math.max(MIN_PART, snapUp(left / (daysBetween(o.date, t.due) + 1)));
      if (share < r.mins) r = { mins: share, note: `${formatDuration(share)} of ${formatDuration(left)}`, share: true };
    }
    sized.set(t.id, r);
    return r;
  };

  // The ranking: what's due (suggestions' scores) with this week's big tasks' shares among them, then the rest.
  const scored = suggestions({ ...o, tasks: open, blocks, limit: 1000 });
  const first = new Set(scored.map((x) => x.task.id));
  const shares = open.filter((t) => !first.has(t.id) && size(t).share).map((task) => ({ task, score: 2 + importance(task, epicOf(task)) }));
  const primary = [...scored, ...shares]
    .map((x) => ({ task: x.task, score: x.score + jitter(o.seed, x.task.id) }))
    .sort((a, b) => b.score - a.score || byOrder(a.task, b.task))
    .map((x) => x.task);
  const inPrimary = new Set(primary.map((t) => t.id));
  const rank = (t: Task) => importance(t, epicOf(t)) + jitter(o.seed, t.id);
  const later = open.filter((t) => !inPrimary.has(t.id))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || rank(b) - rank(a) || byOrder(a, b));
  // Like with like: a task of the same epic or source a little further down moves up beside the one before it.
  const ranked = [...primary, ...later];
  for (let i = 0; i < ranked.length - 1; i++) {
    const c = contextOf(ranked[i]);
    if (!c || contextOf(ranked[i + 1]) === c) continue;
    const j = ranked.findIndex((t, k) => k > i + 1 && k <= i + 1 + BATCH_LOOK && contextOf(t) === c);
    if (j > 0) ranked.splice(i + 1, 0, ...ranked.splice(j, 1));
  }

  const why = (t: Task) => {
    const z = size(t);
    const base = t.due === null ? "no date"
      : t.due < o.today ? `overdue ${daysBetween(t.due, o.today)}d`
      : t.due === o.date ? (o.date === o.today ? "due today" : "due that day")
      : t.due > o.date ? `${z.share ? "due" : "brought forward from"} ${dayWord(t.due, o.today)}`
      : `due ${dayWord(t.due, o.today)}`;
    return z.note ? `${z.note} · ${base}` : base;
  };

  // Slack: past plans say how much of a day's plan gets done; fill that much of the free time (60% at least).
  const rate = doneRate(o.blocks, [...o.tasks, ...(o.done ?? [])], o.today);
  const cap = o.slack === false || rate === null ? freeAtStart : Math.round(freeAtStart * Math.min(1, Math.max(0.6, rate + 0.1)));
  let filled = 0;
  const proposed: FillBlock[] = [];
  const used = new Set<string>();
  const take = (t: Task, s: number, mins: number, note: string) => {
    proposed.push({ task_id: t.id, title: t.title, start: toHM(s), mins, why: note });
    spans = spans.flatMap((x) => (s >= x.e || s + mins <= x.s ? [x] : [{ s: x.s, e: s }, { s: s + mins, e: x.e }]))
      .filter((x) => x.e - x.s >= MIN_GAP);
    used.add(t.id);
    filled += mins;
  };

  // 1. Prep, in the two hours before its meeting, as close to it as there's room.
  for (const t of ranked) {
    const link = t.prep_for;
    const m = link?.date === o.date && link.start ? toMin(link.start) : null;
    if (m == null || m <= from) continue;
    const want = size(t).mins;
    for (const x of [...spans].reverse()) {
      const s0 = Math.max(x.s, m - PREP_LEAD), e0 = Math.min(x.e, m);
      if (e0 - s0 < QUICK_WIN) continue;
      const mins = Math.min(want, e0 - s0);
      take(t, Math.max(s0, Math.floor((e0 - mins) / SNAP) * SNAP), mins, `prep for ${link!.title} at ${fmtTime(link!.start)}`);
      break;
    }
  }
  // 2. A task with a time that day takes it, when it's free.
  for (const t of ranked) {
    const at = t.due === o.date ? toMin(t.time) : null;
    if (at == null || used.has(t.id)) continue;
    const mins = size(t).mins;
    if (spans.some((x) => at >= x.s && at + mins <= x.e)) take(t, at, mins, why(t));
  }
  // 3. Quick wins, in rank order, into the earliest gaps: back to back, early in the day.
  for (const t of ranked) {
    const mins = size(t).mins;
    if (used.has(t.id) || mins > QUICK_WIN || filled + mins > cap) continue;
    const x = spans.find((g) => g.e - g.s >= mins);
    if (x) take(t, x.s, mins, `quick win · ${why(t)}`);
  }
  // 4. The rest: whole in the first gap it fits, else part of it (45m at least for a big task) in the biggest gap.
  for (const t of ranked) {
    if (used.has(t.id) || !spans.length) continue;
    const mins = size(t).mins;
    const big = mins >= 60 || (t.priority === "high" && mins >= MIN_FOCUS);
    const least = Math.min(mins, big ? MIN_FOCUS : MIN_PART);
    const room = Math.min(mins, cap - filled);
    if (room < least) continue;
    const x = spans.find((g) => g.e - g.s >= room);
    if (x) { take(t, x.s, room, room === mins ? why(t) : `part of it · ${why(t)}`); continue; }
    const g = [...spans].sort((a, b) => (b.e - b.s) - (a.e - a.s))[0];
    const part = g ? Math.min(g.e - g.s, room) : 0;
    if (g && part >= least) take(t, g.s, part, `part of it · ${why(t)}`);
  }
  proposed.sort((a, b) => a.start.localeCompare(b.start));
  const free = spans.reduce((n, x) => n + x.e - x.s, 0);
  return {
    ...empty, proposed,
    replaced: doomed.map((b) => ({ task_id: b.task_id, start: b.start, mins: b.mins })),
    free_mins: free, slack_mins: Math.max(0, Math.min(free, freeAtStart - cap)), done_rate: rate,
  };
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
