import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    useConvexConnectionState: () => ({ hasEverConnected: true, isWebSocketConnected: true }),
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

const edit = (title: string) => screen.getByRole("button", { name: new RegExp(`^Open ${title}$`, "i") });

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

const ASK = { from: "09:00", until: "17:00", keep: true, lunch: true, buffer: 10, slack: true };
const planned = (o: Record<string, unknown> = {}) => ({
  date: T, from: "09:00", until: "17:00", committed: false, free_mins: 45, slack_mins: 30, done_rate: 0.7, replaced: [],
  proposed: [
    { task_id: landlord.id, title: "Email landlord", start: "11:00", mins: 30, why: "quick win · due today" },
    { task_id: plants.id, title: "Water plants", start: "11:30", mins: 60, why: "due today" },
  ],
  ...o,
});

it("Auto plan shows the plan on the line first; Accept saves it, and Undo puts the day back", async () => {
  show();
  fn("fillPlan").mockResolvedValueOnce(planned());
  await userEvent.click(screen.getByRole("button", { name: "Auto plan" }));
  expect(fn("fillPlan")).toHaveBeenLastCalledWith({ date: T, ...ASK, seed: 1, commit: false, now: expect.any(Number) });
  const bar = await screen.findByRole("group", { name: "Auto plan preview" });
  expect(bar).toHaveTextContent("2 blocks · 30m slack");
  expect(document.querySelectorAll(".plan-preview")).toHaveLength(2);
  fn("fillPlan").mockResolvedValueOnce(planned({
    committed: true, replaced: [{ task_id: plants.id, start: "15:00", mins: 30 }],
    proposed: planned().proposed.map((p, i) => ({ ...p, id: `b${i + 1}` })),
  }));
  await userEvent.click(within(bar).getByRole("button", { name: "Accept" }));
  expect(fn("fillPlan")).toHaveBeenLastCalledWith({ date: T, ...ASK, seed: 1, commit: true, now: expect.any(Number) });
  expect(document.querySelectorAll(".plan-preview")).toHaveLength(0);
  expect(await within(toast()).findByText("Planned 2, 30m left as slack")).toBeInTheDocument();
  await userEvent.click(within(toast()).getByRole("button", { name: /undo/i }));
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: landlord.id, date: T, block_id: "b1" });
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: plants.id, date: T, block_id: "b2" });
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: plants.id, date: T, start: "15:00", mins: 30 });
});

it("Shuffle asks again with a new seed, and Cancel drops the preview", async () => {
  show();
  fn("fillPlan").mockResolvedValue(planned());
  await userEvent.click(screen.getByRole("button", { name: "Auto plan" }));
  const bar = await screen.findByRole("group", { name: "Auto plan preview" });
  await userEvent.click(within(bar).getByRole("button", { name: "Shuffle" }));
  expect(fn("fillPlan")).toHaveBeenLastCalledWith(expect.objectContaining({ seed: 2, commit: false }));
  await userEvent.click(within(await screen.findByRole("group", { name: "Auto plan preview" })).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("group", { name: "Auto plan preview" })).toBeNull();
  expect(fn("fillPlan")).not.toHaveBeenCalledWith(expect.objectContaining({ commit: true }));
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

it("Enter on a docket title opens the sheet instead of starting a drag", async () => {
  show();
  edit("Water plants").focus();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByText(/^Picked up/)).not.toBeInTheDocument();
});

it("p on an already planned docket adds another block; Undo takes just that one off and leaves the first", async () => {
  show();
  fn("plan").mockResolvedValue({
    date: T, committed: true, unplaced: [], proposed: [{ id: "new1", task_id: report.id, title: "Write report", start: "13:00", mins: 90 }],
  });
  edit("Write report").focus();
  await userEvent.keyboard("p");
  await within(toast()).findByText("Planned Write report for 1:00");
  await userEvent.click(within(toast()).getByRole("button", { name: /undo/i }));
  await waitFor(() => expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, block_id: "new1" }));
  expect(fn("placeBlock")).not.toHaveBeenCalled();
});

it("Auto plan's options are remembered, and another day is planned straight away", async () => {
  show();
  fn("fillPlan").mockResolvedValue(planned({ proposed: [], free_mins: 240, slack_mins: 0 }));
  await userEvent.click(screen.getByRole("button", { name: "Auto plan options" }));
  const menu = screen.getByRole("dialog", { name: "Auto plan options" });
  const [from, until] = within(menu).getAllByDisplayValue(/\d\d:\d\d/) as HTMLInputElement[];
  fireEvent.change(from, { target: { value: "08:00" } });
  fireEvent.change(until, { target: { value: "12:00" } });
  await userEvent.click(within(menu).getByRole("checkbox", { name: "Keep what's already planned" }));
  await userEvent.click(within(menu).getByRole("checkbox", { name: "Keep lunch free (12–1)" }));
  await userEvent.click(within(menu).getByRole("checkbox", { name: "Leave slack, from how my days go" }));
  await userEvent.selectOptions(within(menu).getByRole("combobox", { name: "After meetings" }), "15");
  await userEvent.selectOptions(within(menu).getByRole("combobox", { name: "Day" }), "Tomorrow");
  await userEvent.click(within(menu).getByRole("button", { name: "Plan tomorrow" }));
  const ask = { from: "08:00", until: "12:00", keep: false, lunch: false, buffer: 15, slack: false };
  expect(fn("fillPlan")).toHaveBeenCalledWith({ date: "2026-03-11", ...ask, commit: true, now: expect.any(Number) });
  expect(await within(toast()).findByText("Nothing left to plan for tomorrow")).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("toodoo.autoPlan")!)).toEqual(ask);
});

it("Replan from now moves missed blocks on, and Undo puts them back", async () => {
  show();
  fn("replan").mockResolvedValue({
    ...planned({ committed: true }), removed: [{ task_id: landlord.id, start: "09:00", mins: 30 }],
    proposed: [{ id: "b1", task_id: landlord.id, title: "Email landlord", start: "14:00", mins: 30, why: "due today" }],
    tomorrow: [{ id: "b2", task_id: plants.id, title: "Water plants", start: "09:00", mins: 60, why: "due today", date: "2026-03-11" }],
  });
  await userEvent.click(screen.getByRole("button", { name: "Auto plan options" }));
  await userEvent.click(screen.getByRole("button", { name: /Replan from now/ }));
  expect(fn("replan")).toHaveBeenCalledWith({ date: T, ...ASK, commit: true, now: expect.any(Number) });
  expect(await within(toast()).findByText("Replanned: 1 for the rest of today, 1 moved to tomorrow")).toBeInTheDocument();
  await userEvent.click(within(toast()).getByRole("button", { name: /undo/i }));
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: plants.id, date: "2026-03-11", block_id: "b2" });
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: landlord.id, date: T, start: "09:00", mins: 30 });
});

it("a keyboard drag never says it was dropped on the day plan, and a manual-sort docket is announced as sortable", async () => {
  show();
  expect(edit("Water plants")).toHaveAttribute("aria-roledescription", "sortable");
  edit("Water plants").focus();
  const seen: string[] = [];
  const region = () => document.querySelector("[id^=DndLiveRegion]")!;
  new MutationObserver(() => seen.push(region().textContent ?? "")).observe(region(), { childList: true, characterData: true, subtree: true });
  await userEvent.keyboard(" ");
  await userEvent.keyboard("{ArrowRight}");
  await userEvent.keyboard(" ");
  await new Promise((r) => setTimeout(r, 50));
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.join(" ")).not.toMatch(/day plan/i);
});

it("Space that picks a docket up does not also open the sheet", async () => {
  show();
  edit("Water plants").focus();
  await userEvent.keyboard(" ");
  await screen.findByText(/^water plants is over /);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await userEvent.keyboard(" ");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
