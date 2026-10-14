import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import { BLOCK_LEAD, minToPx } from "./plan";
import type { BoardData } from "./types";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
const state = vi.hoisted(() => ({ board: null as unknown, args: [] as any[], fns: {} as Record<string, any> }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    Authenticated: ({ children }: any) => children,
    Unauthenticated: () => null,
    AuthLoading: () => null,
    useConvexConnectionState: () => ({ hasEverConnected: true, isWebSocketConnected: true }),
    // The board answers for whatever date was asked, so navigation can be followed.
    useQuery: (_ref: unknown, args: any) => {
      state.args.push(args);
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
const filed = task({ title: "File taxes", done: true, done_on: T });
const board = (o: Partial<BoardData> = {}): BoardData => ({
  today: T, date: T, nowM: 10 * 60 + 30, app_url: null, day: null,
  tasks: [report, landlord, plants, filed],
  blocks: [{ id: "blk1", task_id: report.id, date: T, start: "09:00", mins: 60 }],
  suggestions: [{ id: plants.id, title: plants.title, reasons: ["high priority"] }],
  ...o,
});
const fn = (name: string) => state.fns[name] as ReturnType<typeof vi.fn>;

const show = (b = board()) => {
  state.board = b;
  const r = render(<App />);
  fn("addTasks").mockResolvedValue({ created: [{ id: "new1", title: "x", source: "you", external_id: null }], skipped: [], errors: [] });
  fn("updateTask").mockResolvedValue({});
  fn("placeBlock").mockResolvedValue({});
  fn("removeBlock").mockResolvedValue({});
  return r;
};

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  state.args = [];
  state.fns = {};
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const block = () => screen.getByRole("button", { name: "Write report, 9:00–10:00" });
const slots = () => screen.getByRole("group", { name: "Free time" });
// The grid opens at 6am; click where a block starting at `m` would have its top edge.
const clickSlot = (m: number) => fireEvent.click(slots(), { clientY: minToPx(m, 360) - BLOCK_LEAD });

it("arrow keys move a block in 15m steps and Shift resizes it, saved once after a pause", () => {
  vi.useFakeTimers();
  show();
  block().focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown", shiftKey: true });
  act(() => void vi.advanceTimersByTime(300));
  expect(fn("placeBlock")).not.toHaveBeenCalled();
  act(() => void vi.advanceTimersByTime(200));
  expect(fn("placeBlock")).toHaveBeenCalledTimes(1);
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "09:30", mins: 75, block_id: "blk1" });
  expect(screen.getByRole("status", { name: "Notice" })).toHaveTextContent("Moved: Write report");
});

it("keyboard moves clamp at midnight", () => {
  vi.useFakeTimers();
  show();
  block().focus();
  for (let i = 0; i < 40; i++) fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  for (let i = 0; i < 3; i++) fireEvent.keyDown(document.activeElement!, { key: "ArrowUp", shiftKey: true });
  act(() => void vi.advanceTimersByTime(500));
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "00:00", mins: 15, block_id: "blk1" });
});

it("undo after a move puts the block back", async () => {
  vi.useFakeTimers();
  show();
  block().focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  act(() => void vi.advanceTimersByTime(500));
  fireEvent.click(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i }));
  expect(fn("placeBlock")).toHaveBeenLastCalledWith({ task_id: report.id, date: T, start: "09:00", mins: 60, block_id: "blk1" });
});

it("the block's x unplans it with undo", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: "Unplan Write report" }));
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, block_id: "blk1" }); // just this block
  await userEvent.click(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i }));
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "09:00", mins: 60 });
});

it("the block's checkbox ticks the task", async () => {
  show();
  await userEvent.click(screen.getByRole("checkbox", { name: "Done: Write report" }));
  expect(fn("updateTask")).toHaveBeenCalledWith({ id: report.id, patch: { done: true } });
});

it("clicking an empty slot offers suggestions first, then other open tasks", () => {
  show();
  clickSlot(14 * 60);
  const picker = screen.getByRole("dialog", { name: "Plan 2:00" });
  const names = within(picker).getAllByRole("option").map((o) => o.textContent);
  expect(names[0]).toContain("Water plants");
  expect(names.some((x) => x?.includes("Email landlord"))).toBe(true);
  // Already on the line: offered (a task can have another block), but after the rest. Done: not offered.
  const planned = names.findIndex((x) => x?.includes("Write report"));
  expect(planned).toBeGreaterThan(names.findIndex((x) => x?.includes("Email landlord")));
  expect(names[planned]).toContain("already on the line");
  expect(names.some((x) => x?.includes("File taxes"))).toBe(false);
});

it("picking a task places it at the slot for its default length", async () => {
  show();
  clickSlot(14 * 60);
  await userEvent.click(screen.getByRole("option", { name: /Water plants/ }));
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: plants.id, date: T, start: "14:00", mins: 60 });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("the search filters, and Create new adds the parsed task then places it", async () => {
  show();
  clickSlot(14 * 60 + 30);
  const search = screen.getByRole("combobox", { name: "Find or create" });
  await userEvent.type(search, "plumber ~30m !high");
  const options = screen.getAllByRole("option");
  expect(options).toHaveLength(1);
  expect(options[0]).toHaveTextContent("Create");
  await userEvent.keyboard("{Enter}");
  expect(fn("addTasks")).toHaveBeenCalledWith({
    tasks: [{ title: "plumber", due: T, time: null, priority: "high", tags: [], estimate_mins: 30, source: "you" }],
  });
  await waitFor(() => expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: "new1", date: T, start: "14:30", mins: 30 }));
  fn("deleteTask").mockResolvedValue({});
  await userEvent.click(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i }));
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: "new1", date: T });
  await waitFor(() => expect(fn("deleteTask")).toHaveBeenCalledWith({ id: "new1" }));
});

it("r on a focused block opens its task's edit sheet", () => {
  show();
  block().focus();
  fireEvent.keyDown(document.activeElement!, { key: "r" });
  expect(within(screen.getByRole("dialog")).getByDisplayValue("Write report")).toBeInTheDocument();
});

it("a next up title opens its task's ticket", async () => {
  show();
  await userEvent.click(within(screen.getByRole("region", { name: "NEXT UP" })).getByRole("button", { name: "Water plants" }));
  expect(within(screen.getByRole("dialog")).getByRole("heading", { name: "WATER PLANTS" })).toBeInTheDocument();
});

it("Enter on the focused grid opens the picker at the slot cursor; Esc closes it and focus returns", async () => {
  show();
  slots().focus();
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  // Today, the cursor starts at now (10:30); two steps down is 11:00.
  expect(screen.getByRole("dialog", { name: "Plan 11:00" })).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(slots()).toHaveFocus();
});

it("day navigation asks the board for the new date and remembers it in the URL", async () => {
  show();
  expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Next day" }));
  expect(state.args.at(-1).date).toBe("2026-03-11");
  expect(window.location.search).toBe("?date=2026-03-11");
  await userEvent.click(screen.getByRole("button", { name: "Next day" }));
  expect(state.args.at(-1).date).toBe("2026-03-12");
  await userEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(state.args.at(-1).date).toBeUndefined();
  expect(window.location.search).toBe("");
  await userEvent.click(screen.getByRole("button", { name: "Previous day" }));
  expect(state.args.at(-1).date).toBe("2026-03-09");
  expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
});

it("a date in the URL is the day the board opens on", () => {
  window.history.replaceState(null, "", "/?date=2026-03-12");
  show();
  expect(state.args[0].date).toBe("2026-03-12");
});

it("a pending keyboard move is saved before arrows start on another block", () => {
  vi.useFakeTimers();
  show(board({
    blocks: [
      { id: "blk1", task_id: report.id, date: T, start: "09:00", mins: 60 },
      { id: "blk2", task_id: landlord.id, date: T, start: "11:00", mins: 30 },
    ],
  }));
  block().focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  act(() => void vi.advanceTimersByTime(100));
  screen.getByRole("button", { name: "Email landlord, 11:00–11:30" }).focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "09:15", mins: 60, block_id: "blk1" });
  act(() => void vi.advanceTimersByTime(500));
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: landlord.id, date: T, start: "10:45", mins: 30, block_id: "blk2" });
  expect(fn("placeBlock")).toHaveBeenCalledTimes(2);
});

it("a pending keyboard move is saved when the line unmounts", () => {
  vi.useFakeTimers();
  const { unmount } = show();
  block().focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  unmount();
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "09:15", mins: 60, block_id: "blk1" });
});

it("a pending keyboard move is saved when the page is hidden", () => {
  vi.useFakeTimers();
  show();
  block().focus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown", shiftKey: true });
  act(() => void window.dispatchEvent(new Event("pagehide")));
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "09:00", mins: 75, block_id: "blk1" });
  act(() => void vi.advanceTimersByTime(500));
  expect(fn("placeBlock")).toHaveBeenCalledTimes(1);
});

it("Escape during a pointer drag cancels it: no write, no ghost", () => {
  show();
  const body = block();
  fireEvent.pointerDown(body, { clientY: 100, button: 0, pointerId: 1 });
  fireEvent.pointerMove(body, { clientY: 160, pointerId: 1 });
  expect(document.querySelector(".plan-ghost")).not.toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(document.querySelector(".plan-ghost")).toBeNull();
  fireEvent.pointerUp(body, { clientY: 160, pointerId: 1 });
  expect(fn("placeBlock")).not.toHaveBeenCalled();
});

it("a drag that ends drops the block at the snapped time", () => {
  show();
  const body = block();
  fireEvent.pointerDown(body, { clientY: 100, button: 0, pointerId: 1 });
  fireEvent.pointerMove(body, { clientY: 100 + 68.6, pointerId: 1 });
  fireEvent.pointerUp(body, { clientY: 100 + 68.6, pointerId: 1 });
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, start: "10:00", mins: 60, block_id: "blk1" });
});

it("Tab out of the picker closes it", async () => {
  show();
  slots().focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await userEvent.tab();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("an impossible date in the URL falls back to today and is cleaned away", () => {
  window.history.replaceState(null, "", "/?date=2026-02-31");
  show();
  expect(state.args[0].date).toBeUndefined();
  expect(window.location.search).toBe("");
  expect(screen.getByRole("heading", { level: 1, name: "Tuesday 10 Mar" })).toBeInTheDocument();
});

it("a task can sit on the line twice: each block shows and comes off on its own", async () => {
  show(board({
    blocks: [
      { id: "am", task_id: report.id, date: T, start: "09:00", mins: 60 },
      { id: "pm", task_id: report.id, date: T, start: "14:00", mins: 30 },
    ],
  }));
  const unplan = screen.getAllByRole("button", { name: "Unplan Write report" });
  expect(unplan).toHaveLength(2);
  await userEvent.click(unplan[1]);
  expect(fn("removeBlock")).toHaveBeenCalledWith({ task_id: report.id, date: T, block_id: "pm" });
});

it("Ctrl + wheel zooms the line, within its limits, and the zoom is kept", async () => {
  localStorage.removeItem("toodoo.planZoom");
  show();
  const line = () => document.querySelector<HTMLElement>(".plan-scroll")!;
  expect(line().style.getPropertyValue("--zoom")).toBe("1");
  fireEvent.wheel(line(), { deltaY: -100, ctrlKey: true });
  await waitFor(() => expect(Number(line().style.getPropertyValue("--zoom"))).toBeGreaterThan(1)); // after its glide
  expect(Number(localStorage.getItem("toodoo.planZoom"))).toBeGreaterThan(1);
  fireEvent.wheel(line(), { deltaY: 100 }); // no Ctrl: a scroll, not a zoom
  for (let i = 0; i < 20; i++) fireEvent.wheel(line(), { deltaY: 400, ctrlKey: true });
  await waitFor(() => expect(line().style.getPropertyValue("--zoom")).toBe("0.5"));
  localStorage.removeItem("toodoo.planZoom");
});

it("counts the blocks wholly out of sight below or above the line, and a pill goes to the nearest", async () => {
  show();
  const sc = document.querySelector<HTMLElement>(".plan-scroll")!;
  const block = sc.querySelector<HTMLElement>(".plan-block")!;
  const rect = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 100, width: 100, height: h, x: 0, y: top, toJSON: () => ({}) });
  sc.getBoundingClientRect = () => rect(100, 300);
  block.scrollIntoView = vi.fn();
  block.getBoundingClientRect = () => rect(500, 40); // past the foot
  act(() => { sc.dispatchEvent(new Event("scroll")); });
  await userEvent.click(await screen.findByRole("button", { name: "1 below" }));
  expect(block.scrollIntoView).toHaveBeenCalled();
  block.getBoundingClientRect = () => rect(20, 40); // over the head
  act(() => { sc.dispatchEvent(new Event("scroll")); });
  expect(await screen.findByRole("button", { name: "1 above" })).toBeInTheDocument();
  block.getBoundingClientRect = () => rect(380, 40); // partly in sight: not out of it
  act(() => { sc.dispatchEvent(new Event("scroll")); });
  await waitFor(() => expect(screen.queryByRole("button", { name: /above|below/ })).toBeNull());
});
