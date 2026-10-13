import { expect, test } from "vitest";
import { getFunctionName } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Epic } from "@shared/epics.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "../ui/types";
import { createEpic, removeEpic, updateEpic, updateTask, type WorkData, type WorkStore } from "./workOptimistic";

const task = (id: string, o: Partial<FullTask> = {}): FullTask => ({
  id, title: id, due: "2026-10-12", time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 1,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, epic_id: null, status: "todo", ...o,
});
const epic: Epic = { id: "e", title: "E", description: null, priority: null, status: "active", sort_order: 1 };

// One workspace query and one day board, both loaded.
const fake = () => {
  const work: { value: WorkData } = {
    value: { today: "2026-10-12", epics: [epic], done_counts: { e: 2 }, tasks: [task("a", { epic_id: "e" }), task("b")] },
  };
  const board: { value: BoardData } = {
    value: { today: "2026-10-12", date: "2026-10-12", nowM: 600, app_url: null, day: null, suggestions: [], blocks: [],
      epics: [epic], tasks: [task("a", { epic_id: "e" }), task("b")] },
  };
  const isWork = (q: any) => getFunctionName(q) === getFunctionName(api.epics.workspace);
  const store: WorkStore = {
    getAllQueries: (q) => [isWork(q) ? { args: {}, value: work.value } : { args: {}, value: board.value }],
    setQuery: (q, _, v) => { if (isWork(q)) work.value = v; else board.value = v; },
  };
  return { store, work, board };
};

test("a move shows on the Board, the Epics screen and the day at once", () => {
  const { store, work, board } = fake();
  updateTask(store, { id: "b", patch: { epic_id: "e", status: "doing", sort_order: 0.5 } });
  expect(work.value.tasks[1]).toMatchObject({ epic_id: "e", status: "doing", sort_order: 0.5 });
  expect(board.value.tasks[1]).toMatchObject({ epic_id: "e", status: "doing" });
});

test("ticking a task in an epic counts it done, and reopening takes it back", () => {
  const { store, work } = fake();
  updateTask(store, { id: "a", patch: { done: true } });
  expect(work.value.tasks[0]).toMatchObject({ done: true, done_on: "2026-10-12" });
  expect(work.value.done_counts.e).toBe(3);
  updateTask(store, { id: "a", patch: { done: false } });
  expect(work.value.done_counts.e).toBe(2);
});

test("epics are made, changed and deleted everywhere; deleting unfiles their tasks", () => {
  const { store, work, board } = fake();
  createEpic(store, { epic: { title: "New", priority: "high" } });
  expect(work.value.epics.map((e) => e.title)).toEqual(["E", "New"]);
  expect(board.value.epics?.[1]).toMatchObject({ title: "New", priority: "high", status: "planned" });
  updateEpic(store, { id: "e", patch: { status: "on_hold" } });
  expect(work.value.epics[0].status).toBe("on_hold");
  removeEpic(store, { id: "e" });
  expect(work.value.epics.map((e) => e.title)).toEqual(["New"]);
  expect(work.value.tasks[0].epic_id).toBeNull();
  expect(board.value.tasks[0].epic_id).toBeNull();
});
