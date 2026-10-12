import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "./types";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
const state = vi.hoisted(() => ({ board: null as unknown, fns: {} as Record<string, any> }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    Authenticated: ({ children }: any) => children,
    Unauthenticated: () => null,
    AuthLoading: () => null,
    useQuery: (_ref: unknown, args: any) => {
      const b = state.board as BoardData;
      return b && { ...b, date: args?.date ?? b.date };
    },
    useMutation: (ref: any) => {
      const name = getFunctionName(ref).split(":")[1];
      if (!state.fns[name]) {
        const fn: any = vi.fn();
        fn.withOptimisticUpdate = () => fn;
        state.fns[name] = fn;
      }
      return state.fns[name];
    },
  };
});

import { App } from "../App";

const T = "2026-03-10";
let n = 0;
const task = (o: Partial<FullTask> & { title: string }): FullTask => ({
  id: `task${++n}`, due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: n,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, ...o,
});
const report = task({ title: "Write report", estimate_mins: 90 });
const landlord = task({ title: "Email landlord" });
const plants = task({ title: "Water plants", priority: "high" });
const board = (o: Partial<BoardData> = {}): BoardData => ({
  today: T, date: T, nowM: 10 * 60 + 30, app_url: null, day: null,
  tasks: [report, landlord, plants],
  blocks: [{ task_id: report.id, date: T, start: "09:00", mins: 60 }],
  suggestions: [
    { id: landlord.id, title: landlord.title, reasons: ["due today"] },
    { id: plants.id, title: plants.title, reasons: ["high priority"] },
  ],
  ...o,
});
const fn = (name: string) => state.fns[name] as ReturnType<typeof vi.fn>;
const toast = () => screen.getByRole("status", { name: "Notice" });

const show = () => {
  state.board = board();
  const r = render(<App />);
  fn("plan").mockResolvedValue({ date: T, committed: true, proposed: [], unplaced: [] });
  fn("updateTask").mockResolvedValue({});
  fn("placeBlock").mockResolvedValue({});
  fn("removeBlock").mockResolvedValue({});
  return r;
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  state.fns = {};
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const edit = (title: string) => screen.getByRole("button", { name: new RegExp(`^Edit ${title}$`, "i") });

it("p plans the focused docket into the first free slot, and Undo removes the block", async () => {
  show();
  fn("plan").mockResolvedValue({
    date: T, committed: true, unplaced: [], proposed: [{ task_id: plants.id, title: "Water plants", start: "11:00", mins: 60 }],
  });
  edit("Water plants").focus();
  await userEvent.keyboard("p");
  expect(fn("plan")).toHaveBeenCalledWith({ date: T, task_ids: [plants.id], commit: true, now: expect.any(Number) });
  expect(await within(toast()).findByText("Planned Water plants for 11:00")).toBeInTheDocument();
  await userEvent.click(within(toast()).getByRole("button", { name: /undo/i }));
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: plants.id, date: T });
});

it("p with no room toasts the reason", async () => {
  show();
  fn("plan").mockResolvedValue({
    date: T, committed: false, proposed: [], unplaced: [{ task_id: plants.id, title: "Water plants", reason: "no room in that window" }],
  });
  edit("Water plants").focus();
  await userEvent.keyboard("p");
  expect(await within(toast()).findByText(/no room in that window/)).toBeInTheDocument();
});

it("Plan all plans every suggestion, and Undo removes each block", async () => {
  show();
  fn("plan").mockResolvedValue({
    date: T, committed: true, unplaced: [],
    proposed: [
      { task_id: landlord.id, title: "Email landlord", start: "11:00", mins: 30 },
      { task_id: plants.id, title: "Water plants", start: "11:30", mins: 60 },
    ],
  });
  await userEvent.click(screen.getByRole("button", { name: "Plan all" }));
  expect(fn("plan")).toHaveBeenCalledWith({ date: T, task_ids: [landlord.id, plants.id], commit: true, now: expect.any(Number) });
  expect(await within(toast()).findByText("Planned 2")).toBeInTheDocument();
  await userEvent.click(within(toast()).getByRole("button", { name: /undo/i }));
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: landlord.id, date: T });
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: plants.id, date: T });
});

it("picking a docket up with the keyboard announces it in plain English", async () => {
  show();
  edit("Water plants").focus();
  await userEvent.keyboard(" ");
  expect(await screen.findByText(/^water plants is over /)).toBeInTheDocument();
  expect(screen.getByText(/Press space to pick up/)).toBeInTheDocument();
  expect(fn("updateTask")).not.toHaveBeenCalled();
  await userEvent.keyboard("{Escape}");
  expect(await screen.findByText("Cancelled. water plants was put back.")).toBeInTheDocument();
});

it("a keyboard block move made on one day is saved to that day even after navigating on", () => {
  vi.useFakeTimers();
  show();
  screen.getByRole("button", { name: "Write report, 9:00–10:00" }).focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("button", { name: "Next day" }));
  expect(fn("placeBlock")).not.toHaveBeenCalled();
  act(() => void vi.advanceTimersByTime(500));
  expect(fn("placeBlock")).toHaveBeenCalledTimes(1);
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "09:15", mins: 60 });
});
