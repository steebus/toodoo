import { expect, it } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "../ui/types";
import { focusBlock } from "./focus";

const T = "2026-10-13";
const task = (id: string, done = false): FullTask => ({
  id, title: id, due: T, time: null, priority: null, estimate_mins: null, done, done_on: done ? T : null, sort_order: 0,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null,
});
const board = (o: Partial<BoardData> = {}): BoardData => ({
  today: T, date: T, nowM: 10 * 60, app_url: null, day: null, suggestions: [],
  tasks: [task("a"), task("b"), task("c", true)],
  blocks: [{ task_id: "a", date: T, start: "09:30", mins: 60 }, { task_id: "b", date: T, start: "11:00", mins: 30 }, { task_id: "c", date: T, start: "10:00", mins: 30 }],
  ...o,
});

it("picks the open block covering now, else the next to start, and never a done task", () => {
  expect(focusBlock(board())).toEqual({ id: "a", startM: 570, endM: 630, state: "now" });
  expect(focusBlock(board(), 640)).toEqual({ id: "b", startM: 660, endM: 690, state: "next" });
  expect(focusBlock(board(), 700)).toBeNull();
});
it("is only for today", () => {
  expect(focusBlock(board({ date: "2026-10-14" }))).toBeNull();
});
