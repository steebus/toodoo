import { expect, it } from "vitest";
import { budget, burndown, dayRange, haystack, leadDays, matches, plannedByDay, streak, weekOf, type StatTask } from "./stats";

const task = (o: Partial<StatTask>): StatTask => ({
  id: "t", title: "T", due: "2026-10-10", time: null, priority: null, estimate_mins: null, done: false, done_on: null,
  sort_order: 0, source: "you", external_id: null, tags: [], link: null, note: null, description: null, created_on: "2026-10-01", touched_on: "2026-10-01", ...o,
});

it("burns down: open is made by then and not done by then; scope is all made", () => {
  const ts = [task({ id: "a" }), task({ id: "b", done: true, done_on: "2026-10-03" }), task({ id: "c", created_on: "2026-10-03" })];
  expect(burndown(ts, dayRange("2026-10-02", "2026-10-03"))).toEqual([
    { date: "2026-10-02", scope: 2, open: 2 },
    { date: "2026-10-03", scope: 3, open: 2 },
  ]);
});

it("splits planned time into gone by and ahead, today at the clock", () => {
  const blocks = [
    { task_id: "a", date: "2026-10-09", start: "09:00", mins: 60 },
    { task_id: "a", date: "2026-10-10", start: "11:30", mins: 60 },
  ];
  expect(plannedByDay(blocks, ["2026-10-09", "2026-10-10"], "2026-10-10", 12 * 60)).toEqual([
    { date: "2026-10-09", spent: 60, ahead: 0 },
    { date: "2026-10-10", spent: 30, ahead: 30 },
  ]);
  expect(budget([task({ id: "a", estimate_mins: 45 }), task({ id: "b" })], blocks, "2026-10-10", 720)).toMatchObject([{ est: 45, actual: 90 }]);
});

it("weeks start Monday; lead time and streaks count days", () => {
  expect(weekOf("2026-10-14")).toBe("2026-10-12"); // a Wednesday
  expect(weekOf("2026-10-12")).toBe("2026-10-12");
  expect(leadDays(task({ done: true, done_on: "2026-10-04" }))).toBe(3);
  expect(streak(new Set(["2026-10-09", "2026-10-08", "2026-10-06"]), "2026-10-10")).toBe(2);
});

it("search finds every word anywhere on the task", () => {
  const hay = haystack(task({ title: "Fix login", checklist: [{ text: "check OAuth redirect", done: false }], tags: ["work"] }), {
    id: "e", title: "Website", description: null, priority: null, status: "active", sort_order: 0, colour: null,
  });
  expect(matches(hay, "oauth website")).toBe(true);
  expect(matches(hay, "login payroll")).toBe(false);
});
