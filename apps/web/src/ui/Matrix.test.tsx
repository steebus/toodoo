import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Epic } from "@shared/epics.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { WorkActions, WorkData } from "../lib/useWork";
import { Matrix } from "./Matrix";

vi.mock("convex/react", () => ({ useQuery: () => [], useMutation: () => vi.fn() })); // the ticket's activity log and files

const T = "2026-10-12";
const task = (id: string, o: Partial<FullTask> = {}): FullTask => ({
  id, title: id, due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 1,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, epic_id: null, status: "todo", ...o,
});
const epics: Epic[] = [{ id: "hot", title: "Hot", description: null, priority: "high", status: "active", sort_order: 1, colour: "amber" }];
const work: WorkData = {
  today: T, epics, done_counts: {}, spent: { big: 60 },
  tasks: [
    task("Urgent thing", { priority: "high", epic_id: "hot" }),
    task("big", { estimate_mins: 240, status: "doing" }),
    task("Finished", { done: true, done_on: T }),
  ],
};
const actions = (): WorkActions => ({
  offline: false, toast: null, dismiss: vi.fn(), move: vi.fn(), save: vi.fn(async () => true), add: vi.fn(async () => true),
  remove: vi.fn(), plan: vi.fn(), createEpic: vi.fn(async () => true), updateEpic: vi.fn(async () => true), removeEpic: vi.fn(),
});
afterEach(() => { cleanup(); localStorage.clear(); });
const dot = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

it("plots the open tasks, coloured by epic and sized by the work left", () => {
  render(<Matrix work={work} actions={actions()} />);
  expect(dot("Urgent thing").style.getPropertyValue("--dot")).toBe("var(--epic-amber)");
  expect(Number(dot("big").dataset.r)).toBeGreaterThan(Number(dot("Urgent thing").dataset.r));
  expect(screen.queryByRole("button", { name: /^Finished,/ })).toBeNull();
});

it("filters by status", async () => {
  render(<Matrix work={work} actions={actions()} />);
  await userEvent.click(screen.getByRole("button", { name: "View" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "done");
  expect(dot("Finished")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^big,/ })).toBeNull();
});

it("a click opens the task's ticket; arrows move its due date and priority, with Undo", async () => {
  const a = actions();
  render(<Matrix work={work} actions={a} />);
  fireEvent.pointerDown(dot("big"), { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(dot("big"), { clientX: 10, clientY: 10 });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  dot("Urgent thing").focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(a.move).toHaveBeenLastCalledWith(expect.any(String), { due: "2026-10-13" }, "Due Tue 13 Oct: Urgent thing");
  await userEvent.keyboard("{ArrowDown}");
  expect(a.move).toHaveBeenLastCalledWith(expect.any(String), { priority: "med" }, "med: Urgent thing");
});

it("a drag across and down sets a later date and a lower priority", () => {
  const a = actions();
  render(<Matrix work={work} actions={a} />);
  const plot = screen.getByRole("group", { name: "Tasks by urgency and importance" });
  plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 400, right: 1000, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });
  const d = dot("Urgent thing");
  fireEvent.pointerDown(d, { button: 0, clientX: 300, clientY: 50 });
  fireEvent.pointerMove(d, { clientX: 900, clientY: 350 });
  fireEvent.pointerUp(d, { clientX: 900, clientY: 350 });
  const [, patch] = (a.move as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(patch.priority).toBe("low");
  expect(patch.due > T).toBe(true);
});
