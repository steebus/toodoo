import { describe, expect, it } from "vitest";
import { byEpicRank, effectivePriority, priorityScore, type Epic } from "./epics.ts";
import { suggestions, type Task } from "./planning.ts";

const epic = (o: Partial<Epic>): Epic => ({ id: "e", title: "E", description: null, priority: null, status: "active", sort_order: 0, ...o });

describe("a task's priority under its epic", () => {
  it("leaves tasks with no epic as they are", () => {
    expect(effectivePriority({ priority: "high" })).toBe("high");
    expect(effectivePriority({ priority: "med" })).toBe("med");
    expect(effectivePriority({ priority: null })).toBe(null);
    expect(effectivePriority({ priority: "low" })).toBe("low");
  });
  it("lets the epic count for half", () => {
    const high = epic({ priority: "high" }), low = epic({ priority: "low" });
    expect(effectivePriority({ priority: null }, high)).toBe("med");
    expect(effectivePriority({ priority: "med" }, high)).toBe("high");
    expect(effectivePriority({ priority: "high" }, low)).toBe("high");
    expect(effectivePriority({ priority: "low" }, low)).toBe("low");
    expect(priorityScore({ priority: "med" }, high)).toBeGreaterThan(priorityScore({ priority: "med" }));
  });
  it("sinks tasks whose epic is on hold", () => {
    expect(effectivePriority({ priority: null }, epic({ status: "on_hold" }))).toBe("low");
    expect(effectivePriority({ priority: "high" }, epic({ status: "on_hold" }))).toBe(null);
  });
});

it("ranks epics active first, then by priority", () => {
  const list = [
    epic({ id: "d", status: "done", priority: "high" }),
    epic({ id: "p", status: "planned", priority: "high" }),
    epic({ id: "a2", status: "active", priority: "low" }),
    epic({ id: "a1", status: "active", priority: "high" }),
  ];
  expect(list.sort(byEpicRank).map((e) => e.id)).toEqual(["a1", "a2", "p", "d"]);
});

describe("suggestions with epics and status", () => {
  const T = "2026-10-12";
  const task = (o: Partial<Task>): Task => ({
    id: "t", title: "t", due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 0, ...o,
  });
  const run = (tasks: Task[], epics: Epic[] = []) =>
    suggestions({ date: T, today: T, nowM: 600, tasks, blocks: [], epics }).map((s) => s.task.id);

  it("lifts a task in a high epic above a plain one", () => {
    expect(run([task({ id: "plain", sort_order: 0 }), task({ id: "lifted", sort_order: 1, epic_id: "e" })], [epic({ priority: "high" })]))
      .toEqual(["lifted", "plain"]);
  });
  it("brings a future task forward when its epic makes it high", () => {
    const later = task({ id: "later", due: "2026-10-20", priority: "med", epic_id: "e" });
    expect(run([later])).toEqual([]);
    expect(run([later], [epic({ priority: "high" })])).toEqual(["later"]);
  });
  it("puts work in progress first and blocked work last", () => {
    expect(run([task({ id: "blocked", status: "blocked" }), task({ id: "todo", sort_order: 1 }), task({ id: "doing", sort_order: 2, status: "doing" })]))
      .toEqual(["doing", "todo", "blocked"]);
  });
});
