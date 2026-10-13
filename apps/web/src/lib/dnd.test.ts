import { expect, it } from "vitest";
import { resolveDragEnd, TIMELINE, type DragEndLike, type DropEnv } from "./dnd";
import { minToPx } from "../ui/plan";

const tasks = new Map([
  ["a", { sort_order: 1, priority: null, estimate_mins: null }],
  ["b", { sort_order: 2, priority: null, estimate_mins: null }],
  ["c", { sort_order: 4, priority: null, estimate_mins: null }],
  ["d", { sort_order: 9, priority: "high" as const, estimate_mins: null }],
  ["e", { sort_order: 10, priority: null, estimate_mins: 90 }],
]);
const env = (o: Partial<DropEnv> = {}): DropEnv => ({
  groups: [{ id: "today", ids: ["a", "b", "c"] }, { id: "later", ids: ["d", "e"] }],
  manual: true, tasks, planned: () => 0, ...o,
});
const END = (active: string, over: string | null, extra: Partial<DragEndLike> = {}): DragEndLike => ({
  active: { id: active }, over: over ? { id: over, data: { current: {} } } : null, activatorEvent: { clientY: 0 }, delta: { x: 0, y: 0 }, ...extra,
});

it("dropping a docket on a later neighbour sorts between that neighbour and the next", () => {
  expect(resolveDragEnd(END("a", "b"), env())).toEqual({ kind: "reorder", id: "a", sortOrder: 3 });
});
it("dropping at the end sorts one past the last", () => {
  expect(resolveDragEnd(END("a", "c"), env())).toEqual({ kind: "reorder", id: "a", sortOrder: 5 });
});
it("dropping at the start sorts one before the first", () => {
  expect(resolveDragEnd(END("c", "a"), env())).toEqual({ kind: "reorder", id: "c", sortOrder: 0 });
});
it("does nothing when the sort is not manual, on itself, or across groups", () => {
  expect(resolveDragEnd(END("a", "b"), env({ manual: false }))).toBeNull();
  expect(resolveDragEnd(END("a", "a"), env())).toBeNull();
  expect(resolveDragEnd(END("a", "d"), env())).toBeNull();
  expect(resolveDragEnd(END("a", null), env())).toBeNull();
});

const onLine = (id: string, minute: number, gridTop = 100) =>
  END(id, TIMELINE, {
    over: { id: TIMELINE, data: { current: { gridTop: () => gridTop, startM: 360, endM: 1320 } } },
    activatorEvent: { clientY: 300 },
    delta: { x: 0, y: gridTop + minToPx(minute, 360) - 300 },
  });

it("dropping on the line plans at the snapped minute under the pointer", () => {
  // On the 5-minute grid: 10:07 snaps to 10:05, 10:08 to 10:10; the default length is 30m.
  expect(resolveDragEnd(onLine("a", 10 * 60 + 7), env())).toEqual({ kind: "plan", id: "a", start: 605, mins: 30 });
  expect(resolveDragEnd(onLine("a", 10 * 60 + 8), env())).toEqual({ kind: "plan", id: "a", start: 610, mins: 30 });
});
it("the planned length is the task's default, less what is already planned", () => {
  expect(resolveDragEnd(onLine("d", 600), env())).toMatchObject({ mins: 60 });
  expect(resolveDragEnd(onLine("e", 600), env())).toMatchObject({ mins: 90 });
  expect(resolveDragEnd(onLine("e", 600), env({ planned: () => 30 }))).toMatchObject({ mins: 60 });
});
it("a drop past midnight stays inside the day, and a keyboard drag has no pointer so plans nothing", () => {
  expect(resolveDragEnd(onLine("a", 23 * 60 + 50), env())).toMatchObject({ start: 23 * 60 + 50, mins: 10 });
  expect(resolveDragEnd({ ...onLine("a", 600), activatorEvent: { key: "Space" } as never }, env())).toBeNull();
});

it("moves a docket to another status rail, in before the docket it lands on or at the rail's end", () => {
  const e = env({ moves: true, groups: [{ id: "today", ids: ["a", "b", "c"] }, { id: "done", ids: ["d", "e"] }, { id: "comingup", ids: [] }] });
  expect(resolveDragEnd(END("a", "e"), e)).toEqual({ kind: "move", id: "a", to: "done", sortOrder: 9.5 });
  expect(resolveDragEnd(END("a", "rail:comingup"), e)).toEqual({ kind: "move", id: "a", to: "comingup", sortOrder: expect.any(Number) });
  expect(resolveDragEnd(END("d", "rail:today"), e)).toEqual({ kind: "move", id: "d", to: "today", sortOrder: 5 });
  expect(resolveDragEnd(END("a", "rail:today"), e)).toBeNull(); // its own rail: nothing to do
});
it("won't drag a docket into Carried over, and only moves when the rails are the status groups", () => {
  const e = env({ moves: true, groups: [{ id: "carried", ids: ["d"] }, { id: "today", ids: ["a"] }] });
  expect(resolveDragEnd(END("a", "d"), e)).toBeNull();
  expect(resolveDragEnd(END("a", "rail:carried"), e)).toBeNull();
  expect(resolveDragEnd(END("a", "d"), env())).toBeNull();
});
