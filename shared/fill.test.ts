import { expect, it } from "vitest";
import { addDays, doneRate, fillDay, freeSpans, type Block, type DoneTask, type Task } from "./planning.ts";
import type { Epic } from "./epics.ts";

const D = "2026-10-15"; // a Thursday
let n = 0;
const task = (title: string, p: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title, due: D, time: null, priority: null, estimate_mins: 30, done: false, done_on: null, sort_order: n,
  epic_id: null, status: "todo", ...p,
});
const epic = (id: string, o: Partial<Epic> = {}): Epic =>
  ({ id, title: id, description: null, priority: null, status: "active", sort_order: 0, colour: null, ...o });
const at = (r: ReturnType<typeof fillDay>) => r.proposed.map((b) => `${b.start} ${b.title} ${b.mins}`);
// The plain fill: no lunch, no buffer, no history.
const base = { date: D, today: D, nowM: 0, events: [], blocks: [] as Block[], lunch: null, buffer: 0 };

it("finds the free stretches of a window around what's busy", () => {
  expect(freeSpans(540, 720, [{ s: 600, e: 630 }, { s: 700, e: 702 }])).toEqual([{ s: 540, e: 600 }, { s: 630, e: 700 }, { s: 705, e: 720 }]);
});

it("fills the window around events and blocks already there, quick wins together first", () => {
  const big = task("Write report", { priority: "high", estimate_mins: 90 });
  const q1 = task("Pay invoice", { estimate_mins: 10 });
  const q2 = task("Book dentist", { estimate_mins: 5 });
  const mid = task("Review PR", { estimate_mins: 45 });
  const kept = task("Already planned", { estimate_mins: 60 });
  const r = fillDay({
    ...base, from: 9 * 60, until: 13 * 60, tasks: [big, q1, q2, mid, kept],
    events: [{ start: "10:00", end: "10:30", title: "Standup" }],
    blocks: [{ task_id: kept.id, date: D, start: "12:00", mins: 60 }],
  });
  expect(at(r)).toEqual(["09:00 Pay invoice 10", "09:10 Book dentist 5", "09:15 Review PR 45", "10:30 Write report 90"]);
  expect(r.proposed[0].why).toBe("quick win · due today");
  expect(r.free_mins).toBe(0);
});

it("keeps lunch and a buffer after each meeting free by default", () => {
  const a = task("A", { estimate_mins: 60 });
  const b = task("B", { estimate_mins: 60 });
  const c = task("C", { estimate_mins: 60 });
  const r = fillDay({ date: D, today: D, nowM: 0, blocks: [], from: 9 * 60, until: 14 * 60, tasks: [a, b, c],
    events: [{ start: "09:00", end: "10:00", title: "Standup" }] });
  expect(at(r)).toEqual(["10:10 A 60", "11:10 C 50", "13:00 B 60"]); // 10 minutes after standup; noon to one stays free
});

it("never plans Blocked or Backlog work, nor an on-hold epic's", () => {
  const ok = task("Fine");
  const r = fillDay({ ...base, from: 540, until: 720, epics: [epic("e", { status: "on_hold" })],
    tasks: [ok, task("Blocked", { status: "blocked" }), task("Backlog", { status: "backlog" }), task("Held", { epic_id: "e" })] });
  expect(r.proposed.map((p) => p.title)).toEqual(["Fine"]);
});

it("puts prep in the two hours before its meeting, as close to it as there's room", () => {
  const prep = task("Demo script", { due: "2026-10-17", estimate_mins: 30, prep_for: { date: D, start: "14:00", title: "Client demo" } });
  const r = fillDay({ ...base, from: 9 * 60, until: 17 * 60, tasks: [prep], events: [{ start: "14:00", end: "15:00", title: "Client demo" }] });
  expect(at(r)).toEqual(["13:30 Demo script 30"]); // due Saturday, but its meeting is today
  expect(r.proposed[0].why).toBe("prep for Client demo at 2pm");
});

it("brings tasks forward once today's run out, soonest due first, then importance", () => {
  const today = task("Today's one", { estimate_mins: 60 });
  const fri = task("Friday thing", { due: "2026-10-17", estimate_mins: 60 });
  const thu = task("Thursday thing", { due: "2026-10-16", estimate_mins: 60 });
  const fri2 = task("Friday, high epic", { due: "2026-10-17", estimate_mins: 60, epic_id: "e1" });
  const r = fillDay({ ...base, from: 9 * 60, until: 13 * 60, tasks: [today, fri, thu, fri2], epics: [epic("e1", { priority: "high" })] });
  expect(at(r)).toEqual(["09:00 Today's one 60", "10:00 Thursday thing 60", "11:00 Friday, high epic 60", "12:00 Friday thing 60"]);
  expect(r.proposed[1].why).toBe("brought forward from tomorrow");
});

it("gives a big task due this week a daily share, among today's work, not a crunch later", () => {
  const big = task("Quarterly report", { due: "2026-10-18", estimate_mins: 240 }); // Sunday: 4 days from today
  const small = task("Today's job", { estimate_mins: 60, priority: "low" });
  const r = fillDay({ ...base, from: 9 * 60, until: 17 * 60, tasks: [big, small] });
  expect(r.proposed.find((p) => p.title === "Quarterly report")).toMatchObject({ mins: 60, why: "1h of 4h · due Sun, 18 Oct" });
});

it("keeps tasks of the same epic or source together", () => {
  const j1 = task("Jira one", { source: "jira", priority: "high" });
  const other = task("Other", { priority: "med" });
  const j2 = task("Jira two", { source: "jira", priority: "low" });
  const r = fillDay({ ...base, from: 9 * 60, until: 17 * 60, tasks: [j1, other, j2] });
  expect(r.proposed.map((p) => p.title)).toEqual(["Jira one", "Jira two", "Other"]);
});

it("gives a big task 45 minutes at least when it can only have part, a smaller one 30", () => {
  const big = task("Deep work", { estimate_mins: 180 });
  const r = fillDay({ ...base, from: 9 * 60, until: 10 * 60 + 40, tasks: [big], events: [{ start: "09:40", end: "10:00", title: "x" }] });
  expect(at(r)).toEqual([]); // 40m gaps: too small for a big task
  const r2 = fillDay({ ...base, from: 9 * 60, until: 11 * 60, tasks: [big] });
  expect(at(r2)).toEqual(["09:00 Deep work 120"]);
  expect(r2.proposed[0].why).toBe("part of it · due today");
});

it("replaces the day's blocks ahead when not keeping them, and never plans before now", () => {
  const a = task("Old block", { estimate_mins: 60 });
  const b = task("Urgent", { priority: "high", estimate_mins: 60 });
  const blocks: Block[] = [{ task_id: a.id, date: D, start: "11:00", mins: 60 }, { task_id: a.id, date: D, start: "08:00", mins: 30 }];
  const r = fillDay({ ...base, nowM: 10 * 60 + 2, from: 9 * 60, until: 12 * 60, tasks: [a, b], blocks, keep: false });
  expect(r.from).toBe("10:10");
  expect(r.replaced).toEqual([{ task_id: a.id, start: "11:00", mins: 60 }]);
  expect(at(r)[0]).toBe("10:10 Urgent 60");
});

it("leaves slack from past plans: fills only as much as usually gets done", () => {
  // Twenty blocks over the last fortnight, half of them done: fill 60% of the window.
  const past = Array.from({ length: 20 }, (_, i) => task(`Past ${i}`, { done: i < 10, done_on: i < 10 ? addDays(D, -1 - (i % 10)) : null }));
  const blocks: Block[] = past.map((t, i) => ({ task_id: t.id, date: addDays(D, -1 - (i % 10)), start: "09:00", mins: 30 }));
  expect(doneRate(blocks, past, D)).toBe(0.5);
  const todo = Array.from({ length: 10 }, (_, i) => task(`Job ${i}`, { estimate_mins: 30 }));
  const done = past.filter((t) => t.done);
  const r = fillDay({ ...base, from: 9 * 60, until: 14 * 60, tasks: todo, blocks, done });
  expect(r.done_rate).toBe(0.5);
  expect(r.proposed.reduce((s, p) => s + p.mins, 0)).toBe(180); // 60% of 5h
  expect(r.slack_mins).toBe(120);
  expect(fillDay({ ...base, from: 9 * 60, until: 14 * 60, tasks: todo, blocks, done, slack: false }).slack_mins).toBe(0);
});

it("sizes a task without an estimate from what its kind took lately", () => {
  const done: DoneTask[] = ["a", "b", "c"].map((id) => ({ id, done_on: addDays(D, -2), tags: ["admin"], epic_id: null, source: "you" }));
  const blocks: Block[] = done.map((t) => ({ task_id: t.id, date: addDays(D, -2), start: "09:00", mins: 20 }));
  const r = fillDay({ ...base, from: 9 * 60, until: 17 * 60, tasks: [task("Tax forms", { estimate_mins: null, tags: ["admin"] })], blocks, done });
  expect(r.proposed[0]).toMatchObject({ mins: 20, why: "~20m, like #admin · due today" });
});

it("Shuffle swaps near-equal tasks, and the same seed gives the same plan", () => {
  const tasks = Array.from({ length: 6 }, (_, i) => task(`Same ${i}`, { estimate_mins: 30 }));
  const a = fillDay({ ...base, from: 540, until: 720, tasks, seed: 7 });
  expect(fillDay({ ...base, from: 540, until: 720, tasks, seed: 7 }).proposed).toEqual(a.proposed);
  const orders = new Set([1, 2, 3, 4, 5].map((seed) => fillDay({ ...base, from: 540, until: 720, tasks, seed }).proposed.map((p) => p.title).join()));
  expect(orders.size).toBeGreaterThan(1);
});

it("plans just the tasks asked for, and nothing on a past day", () => {
  const a = task("A"), b = task("B");
  expect(fillDay({ ...base, tasks: [a, b], only: [b.id] }).proposed.map((p) => p.title)).toEqual(["B"]);
  expect(fillDay({ ...base, date: "2026-10-14", tasks: [a] }).proposed).toEqual([]);
});
