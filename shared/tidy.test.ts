import { expect, it } from "vitest";
import { piles, tidyCount, type TidyTask } from "./tidy.ts";

const T = "2026-10-14";
let n = 0;
const task = (o: Partial<TidyTask> & { title: string }): TidyTask => ({
  id: o.title, due: T, time: null, priority: null, estimate_mins: 30, done: false, done_on: null, sort_order: ++n,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, touched_on: T, ...o,
});
const titles = (ts: TidyTask[]) => ts.map((t) => t.title);

it("piles quiet, undated and unsized open tasks; parked ones go quiet after longer; plans and future dates are left", () => {
  const old = "2026-09-01";
  const tasks = [
    task({ title: "Quiet", touched_on: old, due: "2026-09-10" }),
    task({ title: "Quieter", touched_on: "2026-08-01", due: null }),
    task({ title: "Planned lately", touched_on: old, due: "2026-09-10" }),
    task({ title: "Coming up", touched_on: old, due: "2026-11-01" }),
    task({ title: "Parked", touched_on: old, due: null, status: "backlog", estimate_mins: null }),
    task({ title: "Long parked", touched_on: "2026-09-10", due: null, status: "backlog" }),
    task({ title: "Stuck", touched_on: "2026-09-10", status: "blocked", due: "2026-09-20" }),
    task({ title: "Lately stuck", touched_on: "2026-09-20", status: "blocked", due: "2026-09-20" }),
    task({ title: "Lately parked", touched_on: "2026-09-20", status: "backlog", due: null }),
    task({ title: "Fresh", estimate_mins: null }),
    task({ title: "Finished", touched_on: old, done: true, due: null, estimate_mins: null }),
  ];
  const p = piles(tasks, [{ task_id: "Planned lately", date: "2026-10-01" }], T);
  // 09-01 is 43 days back and 09-10 is 34, past the 28 parked days; 09-20 is 24: quiet, but not yet for a parked task
  expect(titles(p.quiet)).toEqual(["Quieter", "Quiet", "Parked", "Long parked", "Stuck"]);
  expect(titles(p.undated)).toEqual(["Quieter"]);
  expect(titles(p.unsized)).toEqual(["Fresh", "Parked"]);
  expect(tidyCount(p)).toBe(6);
});

it("pairs Jira tasks against what Jira lists as open: done here but open there, open here but gone there", () => {
  const j = (title: string, done: boolean) => task({ title, source: "jira", external_id: `jira:${title}`, done });
  const tasks = [j("A-1", true), j("A-2", true), j("A-3", false), j("A-4", false), task({ title: "local" })];
  expect(titles(piles(tasks, [], T, ["jira:A-1", "jira:A-3"]).jira).sort()).toEqual(["A-1", "A-4"]);
  expect(piles(tasks, [], T, null).jira).toEqual([]);
});
