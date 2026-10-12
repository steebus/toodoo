import { describe, expect, it } from "vitest";
import {
  addDays, byOrder, dayWord, daysBetween, fmtTime, formatDuration, nowMin, parseDuration, snapUp, toHM, toMin, today,
} from "./planning.ts";
import { defaultBlockMins, effortMap, suggestions, type Block, type Task } from "./planning.ts";
import { autoPlan, busySpans, firstFree, layoutLanes, timedEvents, type DayEvent } from "./planning.ts";

describe("dates in Brisbane", () => {
  it("uses the Brisbane date at the UTC boundary", () => {
    expect(today(new Date("2026-10-11T23:30:00Z"))).toBe("2026-10-12");
    expect(today(new Date("2026-10-12T13:59:00Z"))).toBe("2026-10-12");
    expect(today(new Date("2026-10-12T14:00:00Z"))).toBe("2026-10-13");
  });
  it("gives minutes since Brisbane midnight", () => {
    expect(nowMin(new Date("2026-10-11T23:30:00Z"))).toBe(9 * 60 + 30);
    expect(nowMin(new Date("2026-10-12T14:00:00Z"))).toBe(0);
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(daysBetween("2026-09-28", "2026-10-12")).toBe(14);
  });
  it("names nearby days", () => {
    expect(dayWord("2026-10-12", "2026-10-12")).toBe("today");
    expect(dayWord("2026-10-13", "2026-10-12")).toBe("tomorrow");
    expect(dayWord("2026-10-11", "2026-10-12")).toBe("yesterday");
    expect(dayWord("2026-10-20", "2026-10-12")).toMatch(/20 Oct/);
  });
});

describe("times", () => {
  it("parses HH:MM and Postgres HH:MM:SS", () => {
    expect(toMin("09:15")).toBe(555);
    expect(toMin("9:05:00")).toBe(545);
    expect(toMin(null)).toBeNull();
    expect(toMin("nope")).toBeNull();
  });
  it("formats and clamps", () => {
    expect(toHM(555)).toBe("09:15");
    expect(toHM(-5)).toBe("00:00");
    expect(toHM(5000)).toBe("23:59");
    expect(snapUp(541)).toBe(555);
    expect(snapUp(540)).toBe(540);
  });
  it("formats 12-hour times", () => {
    expect(fmtTime("09:00")).toBe("9am");
    expect(fmtTime("13:30")).toBe("1:30pm");
    expect(fmtTime("00:15")).toBe("12:15am");
    expect(fmtTime(null)).toBe("");
  });
});

describe("durations", () => {
  it.each([
    ["90", 90], ["45m", 45], ["1.5h", 90], ["1h30", 90], ["1h 30m", 90], ["2hrs", 120], ["1:15", 75], ["", null], [null, null],
  ])("parses %s", (input, expected) => {
    expect(parseDuration(input as string | null)).toBe(expected);
  });
  it("flags nonsense as NaN", () => {
    expect(parseDuration("soon")).toBeNaN();
  });
  it("formats", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
  });
});

describe("byOrder", () => {
  it("sorts by sort_order then id", () => {
    const rows = [{ id: "b", sort_order: 2 }, { id: "c", sort_order: 1 }, { id: "a", sort_order: 2 }];
    expect(rows.sort(byOrder).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});

const T = "2026-10-12";
const task = (id: string, p: Partial<Task> = {}): Task => ({
  id, title: id, due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 0, ...p,
});

describe("effort", () => {
  it("counts past days fully and today up to now", () => {
    const blocks: Block[] = [
      { task_id: "a", date: "2026-10-11", start: "09:00", mins: 60 },
      { task_id: "a", date: T, start: "10:00", mins: 60 },
      { task_id: "a", date: "2026-10-13", start: "10:00", mins: 30 },
    ];
    const e = effortMap(blocks, T, 10 * 60 + 15).get("a")!;
    expect(e.planned).toBe(150);
    expect(e.actual).toBe(75);
    expect([...e.days].sort()).toEqual(["2026-10-11", T, "2026-10-13"]);
  });
  it("defaults block length from the remaining estimate, else priority", () => {
    expect(defaultBlockMins({ priority: null, estimate_mins: 100 }, 30)).toBe(75);
    expect(defaultBlockMins({ priority: null, estimate_mins: 600 }, 0)).toBe(240);
    expect(defaultBlockMins({ priority: "high", estimate_mins: 60 }, 55)).toBe(60);
    expect(defaultBlockMins({ priority: "low", estimate_mins: null })).toBe(30);
  });
});

describe("suggestions", () => {
  const base = { date: T, today: T, nowM: 8 * 60 };
  it("ranks overdue high priority above due-today", () => {
    const tasks = [task("today"), task("old", { due: "2026-10-09", priority: "high" })];
    const s = suggestions({ ...base, tasks, blocks: [] });
    expect(s.map((x) => x.task.id)).toEqual(["old", "today"]);
    expect(s[0].reasons).toEqual(["overdue 3d", "high priority"]);
    expect(s[1].reasons).toEqual(["due today"]);
  });
  it("skips done, already-planned, and future non-high tasks", () => {
    const tasks = [
      task("done", { done: true }), task("planned"), task("future", { due: "2026-10-20" }),
      task("futureHigh", { due: "2026-10-20", priority: "high" }),
    ];
    const blocks: Block[] = [{ task_id: "planned", date: T, start: "09:00", mins: 30 }];
    expect(suggestions({ ...base, tasks, blocks }).map((x) => x.task.id)).toEqual(["futureHigh"]);
  });
  it("boosts tasks unfinished from the previous plan and fixed times", () => {
    const tasks = [task("carry", { due: "2026-10-11" }), task("timed", { time: "14:00" })];
    const blocks: Block[] = [{ task_id: "carry", date: "2026-10-11", start: "09:00", mins: 30 }];
    const s = suggestions({ ...base, tasks, blocks });
    expect(s[0].task.id).toBe("carry");
    expect(s[0].reasons).toEqual(["unfinished from yesterday's plan", "due yesterday"]);
    expect(s[1].reasons).toEqual(["at 2pm", "due today"]);
  });
  it("penalises tasks planned on another day and fully planned estimates", () => {
    const tasks = [task("elsewhere"), task("full", { estimate_mins: 30 }), task("plain")];
    const blocks: Block[] = [
      { task_id: "elsewhere", date: "2026-10-14", start: "09:00", mins: 30 },
      { task_id: "full", date: "2026-10-11", start: "09:00", mins: 30 },
    ];
    const s = suggestions({ ...base, tasks, blocks, limit: 10 });
    const byId = Object.fromEntries(s.map((x) => [x.task.id, x]));
    expect(byId.plain.score).toBeGreaterThan(byId.elsewhere.score);
    expect(byId.elsewhere.reasons.some((r) => r.startsWith("planned "))).toBe(true);
    expect(byId.full.reasons).toContain("estimate already planned");
  });
  it("returns nothing for past days and honours limit", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task("t" + i));
    expect(suggestions({ ...base, date: "2026-10-11", tasks, blocks: [] })).toEqual([]);
    expect(suggestions({ ...base, tasks, blocks: [] })).toHaveLength(5);
  });
});

describe("free slots", () => {
  const events: DayEvent[] = [
    { allDay: true, start: "00:00", end: "23:59", title: "School Holidays" },
    { start: "09:15", end: "09:30", title: "Standup" },
    { start: "10:00", title: "No end" },
  ];
  it("ignores all-day events and gives missing ends 30m", () => {
    expect(timedEvents(events).map(({ s, e }) => [s, e])).toEqual([[555, 570], [600, 630]]);
  });
  it("finds the first snapped gap that fits", () => {
    const busy = busySpans(events, [], "2026-10-12");
    expect(firstFree(30, 9 * 60, busy)).toBe(9 * 60 + 30);
    expect(firstFree(45, 9 * 60, busy)).toBe(10 * 60 + 30);
    expect(firstFree(15, 9 * 60, busy)).toBe(9 * 60);
  });
  it("snaps after events ending off the grid", () => {
    const busy = busySpans([{ start: "09:00", end: "09:10", title: "x" }, { start: "09:20", end: "10:00", title: "y" }], [], "d");
    expect(firstFree(15, 9 * 60, busy)).toBe(10 * 60);
  });
  it("excludes a task's own block", () => {
    const blocks: Block[] = [{ task_id: "a", date: "d", start: "09:00", mins: 60 }];
    expect(busySpans([], blocks, "d", "a")).toEqual([]);
  });
});

describe("autoPlan", () => {
  const D = "2026-10-12";
  const base = { date: D, today: D, nowM: 12 * 60 + 2, events: [] as DayEvent[], blocks: [] as Block[] };
  it("plans suggested tasks from now into free gaps", () => {
    const tasks = [task("a", { priority: "high" }), task("b")];
    // now 12:02 → earliest 12:15; lunch 12:30–13:00 leaves a 15m gap too small for either task
    const r = autoPlan({ ...base, tasks, events: [{ start: "12:30", end: "13:00", title: "Lunch" }] });
    expect(r.proposed).toEqual([
      { task_id: "a", title: "a", start: "13:00", mins: 60 },
      { task_id: "b", title: "b", start: "14:00", mins: 30 },
    ]);
  });
  it("places fixed-time tasks at their time and respects until", () => {
    const tasks = [task("fixed", { time: "15:00" }), task("big", { estimate_mins: 240 })];
    const r = autoPlan({ ...base, tasks, from: 13 * 60, until: 16 * 60 });
    expect(r.proposed.find((p) => p.task_id === "fixed")?.start).toBe("15:00");
    expect(r.unplaced).toEqual([{ task_id: "big", title: "big", reason: "no room in that window" }]);
  });
  it("places fixed-time tasks first so nothing overlaps them", () => {
    const tasks = [task("h", { priority: "high" }), task("f", { time: "13:00" })];
    const r = autoPlan({ ...base, tasks });
    expect(r.proposed).toEqual([
      { task_id: "f", title: "f", start: "13:00", mins: 30 },
      { task_id: "h", title: "h", start: "13:30", mins: 60 },
    ]);
  });
  it("never plans before now on today, and refuses past days", () => {
    const r = autoPlan({ ...base, tasks: [task("a")], from: 9 * 60 });
    expect(r.proposed[0].start).toBe("12:15");
    const past = autoPlan({ ...base, date: "2026-10-11", tasks: [task("a")], taskIds: ["a"] });
    expect(past.proposed).toEqual([]);
    expect(past.unplaced[0].reason).toBe("that day is in the past");
  });
  it("uses explicit task ids and reports ones already planned", () => {
    const tasks = [task("a", { due: "2026-10-30" }), task("b")];
    const blocks: Block[] = [{ task_id: "b", date: D, start: "13:00", mins: 30 }];
    const r = autoPlan({ ...base, tasks, blocks, taskIds: ["a", "b"] });
    expect(r.proposed.map((p) => p.task_id)).toEqual(["a"]);
    expect(r.unplaced).toEqual([{ task_id: "b", title: "b", reason: "already planned that day" }]);
  });
});

describe("layoutLanes", () => {
  it("puts overlapping items side by side", () => {
    const out = layoutLanes([{ s: 0, e: 60 }, { s: 30, e: 90 }, { s: 120, e: 150 }]);
    expect(out.map(({ col, cols }) => [col, cols])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
});
