import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_EPIC } from "@shared/board.ts";
import type { Epic } from "@shared/epics.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { WorkActions, WorkData } from "../lib/useWork";
import { Epics } from "./Epics";
import { columns, Kanban, movePatch } from "./Kanban";

const T = "2026-10-12";
const task = (id: string, o: Partial<FullTask> = {}): FullTask => ({
  id, title: id, due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 1,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, epic_id: null, status: "todo", ...o,
});
const epics: Epic[] = [
  { id: "hot", title: "Hot", description: null, priority: "high", status: "active", sort_order: 1 },
  { id: "old", title: "Old", description: null, priority: null, status: "done", sort_order: 2 },
];
const work = (tasks: FullTask[]): WorkData => ({ today: T, epics, tasks, done_counts: {} });
const actions = (): WorkActions => ({
  offline: false, toast: null, dismiss: vi.fn(), move: vi.fn(), save: vi.fn(async () => true), add: vi.fn(async () => true),
  remove: vi.fn(), createEpic: vi.fn(async () => true), updateEpic: vi.fn(async () => true), removeEpic: vi.fn(),
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe("columns", () => {
  const w = work([
    task("a", { sort_order: 2 }), task("b", { sort_order: 1 }), task("c", { status: "doing", epic_id: "hot" }),
    task("d", { status: "blocked" }), task("e", { done: true, done_on: "2026-10-10" }), task("f", { done: true, done_on: T, status: "doing" }),
  ]);
  it("files open tasks by status in manual order, and done newest first", () => {
    const c = columns(w, { epic: "", sort: "manual" });
    expect(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.map((t) => t.id)])))
      .toEqual({ backlog: [], todo: ["b", "a"], doing: ["c"], blocked: ["d"], done: ["f", "e"] });
  });
  it("filters by epic, or by no epic", () => {
    expect(columns(w, { epic: "hot", sort: "manual" }).doing.map((t) => t.id)).toEqual(["c"]);
    expect(columns(w, { epic: "hot", sort: "manual" }).todo).toEqual([]);
    expect(columns(w, { epic: NO_EPIC, sort: "manual" }).doing).toEqual([]);
  });
  it("sorts by priority as the epic lifts it", () => {
    const w2 = work([task("plain", { sort_order: 0, priority: "med" }), task("lifted", { sort_order: 1, priority: "med", epic_id: "hot" })]);
    expect(columns(w2, { epic: "", sort: "priority" }).todo.map((t) => t.id)).toEqual(["lifted", "plain"]);
  });
});

describe("movePatch", () => {
  it("ticks into Done and leaves the status alone", () => {
    expect(movePatch(task("a", { status: "doing" }), "done")).toEqual({ done: true });
  });
  it("reopens out of Done into a column", () => {
    expect(movePatch(task("a", { done: true, done_on: T }), "blocked", 3)).toEqual({ done: false, status: "blocked", sort_order: 3 });
  });
  it("only sends what changed", () => {
    expect(movePatch(task("a", { sort_order: 3 }), "todo", 3)).toEqual({});
  });
});

it("the Board's ] key moves a card to the next column and Enter opens it", async () => {
  const a = actions();
  render(<Kanban work={work([task("a", { title: "Write it" })])} actions={a} />);
  const card = screen.getByRole("button", { name: "Write it" });
  card.focus();
  await userEvent.keyboard("]");
  expect(a.move).toHaveBeenCalledWith("a", { status: "doing", sort_order: expect.any(Number) }, "Doing: Write it");
  await userEvent.keyboard("{Enter}");
  const ticket = screen.getByRole("dialog", { name: /WRITE IT/ });
  await userEvent.click(within(ticket).getByRole("button", { name: "BLOCKED" }));
  expect(a.save).toHaveBeenLastCalledWith("a", { status: "blocked" });
});

it("the Epics screen hides done epics until filtered in, and unfiles a task with its cross", async () => {
  const a = actions();
  render(<Epics work={work([task("a", { title: "In hot", epic_id: "hot" }), task("b", { title: "Loose" })])} actions={a} />);
  expect(screen.getByRole("heading", { name: "Hot" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Old" })).toBeNull();
  // Epics start folded: open this one to reach its tickets.
  expect(screen.queryByRole("button", { name: "Take In hot out of Hot" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /^Hot$/ }));
  await userEvent.click(screen.getByRole("button", { name: "Take In hot out of Hot" }));
  expect(a.move).toHaveBeenCalledWith("a", { epic_id: null }, "Out of Hot: In hot");
  await userEvent.click(screen.getByRole("button", { name: "Sort and filter" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "all");
  expect(screen.getByRole("heading", { name: "Old" })).toBeTruthy();
  // Status and priority live in the epic's sheet now, not on its card; the card shows its tallies.
  const hot = screen.getByRole("heading", { name: "Hot" }).closest("section")!;
  expect(within(hot).queryByRole("combobox")).toBeNull();
  expect(within(hot).getByText("1 open")).toBeTruthy();
  expect(within(hot).getByRole("button", { name: "Edit Hot" })).toBeTruthy();
  // Old is done: its card says so.
  expect(within(screen.getByRole("heading", { name: "Old" }).closest("section")!).getByText("Done")).toBeTruthy();
});

it("makes a new epic from its sheet", async () => {
  const a = actions();
  render(<Epics work={work([])} actions={a} />);
  await userEvent.click(screen.getByRole("button", { name: /New epic/ }));
  await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Launch");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(a.createEpic).toHaveBeenCalledWith({ title: "Launch", description: null, priority: null, status: "active", colour: "blue" });
});

it("a column folds to a strip in its place, summing what's in it, and unfolds again", async () => {
  render(<Kanban work={work([task("a", { status: "doing", estimate_mins: 90, priority: "high" }), task("b", { status: "doing", estimate_mins: 30 })])} actions={actions()} />);
  await userEvent.click(screen.getByRole("button", { name: "Fold Doing" }));
  const strip = screen.getByRole("button", { name: "Unfold Doing, 2" });
  expect(strip).toHaveTextContent("~2h");
  expect(strip).toHaveTextContent("1 high");
  expect(screen.queryByRole("region", { name: /Doing/ })).toBeNull();
  await userEvent.click(strip);
  expect(screen.getByRole("region", { name: /Doing/ })).toBeInTheDocument();
});
