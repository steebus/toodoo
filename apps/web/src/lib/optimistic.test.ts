import { expect, test } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "../ui/types";
import { addTasks, deleteTask, isOptimistic, placeBlock, removeBlock, updateTask, type Store } from "./optimistic";

const task = (id: string, o: Partial<FullTask> = {}): FullTask => ({
  id, title: id, due: "2026-10-12", time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 1,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, ...o,
});
const board = (date: string): BoardData => ({
  today: "2026-10-12", date, nowM: 600, app_url: null, day: null, suggestions: [],
  tasks: [task("a"), task("b", { done: true, done_on: "2026-10-11" })],
  blocks: [{ task_id: "a", date: "2026-10-12", start: "09:00", mins: 30 }, { task_id: "a", date: "2026-10-13", start: "10:00", mins: 60 }],
});

// Two loaded board queries (today and tomorrow) plus one still loading, which must stay untouched.
const fake = () => {
  const q = [
    { args: { now: 1 }, value: board("2026-10-12") as BoardData | undefined },
    { args: { date: "2026-10-13", now: 1 }, value: board("2026-10-13") as BoardData | undefined },
    { args: { date: "2026-10-14", now: 1 }, value: undefined as BoardData | undefined },
  ];
  const store: Store = {
    getAllQueries: () => q.map((x) => ({ ...x })),
    setQuery: (_, args, v) => { q.find((x) => x.args === args)!.value = v; },
  };
  const both = () => [q[0].value!, q[1].value!];
  return { store, q, both };
};

test("tick sets done_on to today (or the given day) and untick clears it, on every board", () => {
  const { store, q, both } = fake();
  updateTask(store, { id: "a", patch: { done: true } });
  for (const b of both()) expect(b.tasks[0]).toMatchObject({ done: true, done_on: "2026-10-12" });
  updateTask(store, { id: "a", patch: { done: true, done_on: "2026-10-10" } });
  expect(q[0].value!.tasks[0].done_on).toBe("2026-10-10");
  updateTask(store, { id: "b", patch: { done: false } });
  for (const b of both()) expect(b.tasks[1]).toMatchObject({ done: false, done_on: null });
  expect(q[2].value).toBeUndefined();
});

test("estimate is coerced: duration text, numbers rounded, junk to null", () => {
  const { store, q } = fake();
  updateTask(store, { id: "a", patch: { estimate_mins: "1h 30m" } });
  expect(q[0].value!.tasks[0].estimate_mins).toBe(90);
  updateTask(store, { id: "a", patch: { estimate_mins: 44.6 } });
  expect(q[0].value!.tasks[0].estimate_mins).toBe(45);
  updateTask(store, { id: "a", patch: { estimate_mins: "soon" } });
  expect(q[0].value!.tasks[0].estimate_mins).toBeNull();
  updateTask(store, { id: "a", patch: { estimate_mins: null } });
  expect(q[1].value!.tasks[0].estimate_mins).toBeNull();
  updateTask(store, { id: "a", patch: { title: "renamed" } });
  expect(q[1].value!.tasks[0]).toMatchObject({ title: "renamed", estimate_mins: null });
});

test("delete drops the task and all its blocks", () => {
  const { store, both } = fake();
  deleteTask(store, { id: "a" });
  for (const b of both()) {
    expect(b.tasks.map((t) => t.id)).toEqual(["b"]);
    expect(b.blocks).toEqual([]);
  }
});

test("place upserts the block for that task and date; unplace removes only that one", () => {
  const { store, both } = fake();
  placeBlock(store, { task_id: "a", date: "2026-10-12", start: "11:00", mins: 45 });
  placeBlock(store, { task_id: "b", date: "2026-10-12", start: "13:00", mins: 15 });
  for (const b of both()) {
    expect(b.blocks.filter((x) => x.task_id === "a" && x.date === "2026-10-12")).toEqual([{ task_id: "a", date: "2026-10-12", start: "11:00", mins: 45 }]);
    expect(b.blocks).toHaveLength(3);
  }
  removeBlock(store, { task_id: "a", date: "2026-10-12" });
  for (const b of both()) expect(b.blocks.map((x) => `${x.task_id}@${x.date}`)).toEqual(["a@2026-10-13", "b@2026-10-12"]);
});

test("add appends optimistic tasks with defaults", () => {
  const { store, q } = fake();
  addTasks(store, { tasks: [{ title: "New", tags: "junk", estimate_mins: "30m" }] });
  const added = q[1].value!.tasks[2];
  expect(isOptimistic(added.id)).toBe(true);
  expect(added).toMatchObject({ title: "New", due: "2026-10-12", tags: [], estimate_mins: null, done: false, source: "you" });
});
