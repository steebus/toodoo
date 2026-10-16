import { describe, expect, it } from "vitest";
import { dueNudges, fireAt, normTime, type DueTask } from "./notify.ts";
import { nextCalColour } from "./calendars.ts";

const P = { remind_at: "07:00", lead_mins: 15 };
const task = (o: Partial<DueTask>): DueTask => ({ id: "t", title: "Task", due: "2026-10-16", time: null, done: false, ...o });
const bne = (s: string) => Date.parse(`${s}+10:00`);

describe("fireAt", () => {
  it("fires an undated-time task at the morning time, a timed one its lead before", () => {
    expect(fireAt(task({}), P)).toBe(bne("2026-10-16T07:00:00"));
    expect(fireAt(task({ time: "09:30" }), P)).toBe(bne("2026-10-16T09:15:00"));
  });
  it("has nothing for done or undated tasks", () => {
    expect(fireAt(task({ done: true }), P)).toBeNull();
    expect(fireAt(task({ due: null }), P)).toBeNull();
  });
});

describe("dueNudges", () => {
  it("sends what fires in the window: the morning's tasks as one, each timed one alone", () => {
    const tasks = [task({ id: "a", title: "Bins" }), task({ id: "b", title: "Rego" }), task({ id: "c", title: "Call", time: "07:10" }),
      task({ id: "d", title: "Later", time: "12:00" }), task({ id: "e", title: "Tomorrow", due: "2026-10-17" })];
    const n = dueNudges(tasks, P, bne("2026-10-16T06:50:00"), bne("2026-10-16T07:00:00"));
    expect(n).toEqual([
      { title: "Call · in 15m", body: "Due 7:10am", url: "/?date=2026-10-16", tag: "due-c" },
      { title: "2 tasks due today", body: "• Bins\n• Rego", url: "/?date=2026-10-16", tag: "due-2026-10-16" },
    ]);
  });
  it("never sends twice: the window is open at the start, shut at the end", () => {
    const t = [task({})];
    expect(dueNudges(t, P, bne("2026-10-16T07:00:00"), bne("2026-10-16T07:05:00"))).toEqual([]);
    expect(dueNudges(t, P, bne("2026-10-16T06:55:00"), bne("2026-10-16T07:00:00"))).toHaveLength(1);
  });
  it("a round that missed hours sends only the last hour's", () => {
    const t = [task({ time: "03:00" }), task({ id: "x", time: "08:00" })];
    expect(dueNudges(t, { ...P, lead_mins: 0 }, 0, bne("2026-10-16T08:30:00")).map((x) => x.tag)).toEqual(["due-x"]);
  });
});

it("normTime and nextCalColour", () => {
  expect(normTime("7:05")).toBe("07:05");
  expect(normTime("24:00")).toBeNull();
  expect(nextCalColour([])).toBe("rose");
  expect(nextCalColour(["rose", "lagoon"])).toBe("dusk");
});
