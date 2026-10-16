import { expect, it } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import { dayItems, fold, monthGrid, monthLabel, stepMonth } from "./month";

const task = (o: Partial<FullTask>): FullTask => ({
  id: "t", title: "T", due: "2026-10-16", time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 0,
  epic_id: null, status: "todo", tags: [], source: "you", external_id: null, link: null, note: null, description: null, checklist: [], ...o,
});

it("lays a month out in whole weeks, Monday first", () => {
  const g = monthGrid("2026-10");
  expect(g[0]).toBe("2026-09-28");
  expect(g.at(-1)).toBe("2026-11-01");
  expect(g).toHaveLength(35);
  expect(monthGrid("2026-02")[0]).toBe("2026-01-26");
  expect(stepMonth("2026-12", 1)).toBe("2027-01");
  expect(stepMonth("2026-01", -1)).toBe("2025-12");
  expect(monthLabel("2026-10")).toBe("October 2026");
});

it("orders a day: all-day, then by time, then the date-only tasks high first and done last", () => {
  const items = dayItems("2026-10-16", [{ start: "10:00", end: "11:00", title: "Dentist", colour: "rose" }, { allDay: true, title: "Holiday" }], [
    task({ id: "a", title: "Plain" }), task({ id: "b", title: "Done", done: true }), task({ id: "c", title: "High", priority: "high" }),
    task({ id: "d", title: "At 9", time: "09:00" }), task({ id: "e", title: "Other day", due: "2026-10-17" }),
  ]);
  expect(items.map((x) => (x.kind === "event" ? x.title : x.task.title))).toEqual(["Holiday", "At 9", "Dentist", "High", "Plain", "Done"]);
});

it("folds what doesn't fit into a count", () => {
  expect(fold([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], rest: [] });
  expect(fold([1, 2, 3, 4, 5, 6], 3)).toEqual({ shown: [1, 2], rest: [3, 4, 5, 6] });
});
