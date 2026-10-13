import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "./types";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
const state = vi.hoisted(() => ({ board: null as unknown, fns: {} as Record<string, any>, inflight: false }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    Authenticated: ({ children }: any) => children,
    Unauthenticated: () => null,
    AuthLoading: () => null,
    useConvexConnectionState: () => ({ hasEverConnected: true, isWebSocketConnected: true, hasInflightRequests: state.inflight }),
    useQuery: () => state.board,
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
const report = task({ title: "Write report", time: "09:00", priority: "high", estimate_mins: 90, tags: ["work", "q1"], note: "draft first", source: "jira", external_id: "CORE-9" });
const board = (): BoardData => ({
  today: T, date: T, nowM: 10 * 60 + 30, app_url: null, day: null,
  tasks: [report, task({ title: "Email landlord" })],
  blocks: [{ task_id: report.id, date: T, start: "09:00", mins: 60 }],
  suggestions: [],
});
const fn = (name: string) => state.fns[name] as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  state.board = board();
  state.fns = {};
  state.inflight = false;
  render(<App />);
  fn("addTasks").mockResolvedValue({ created: [{ id: "new1", title: "x", source: "you", external_id: null }], skipped: [], errors: [] });
  fn("updateTask").mockResolvedValue({});
  fn("deleteTask").mockResolvedValue({});
  fn("placeBlock").mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const input = () => screen.getByRole("textbox", { name: "New to do" });

it("quick add submits the parsed payload and clears the input", async () => {
  await userEvent.type(input(), "Call plumber tomorrow 3pm !high #home ~30m{Enter}");
  expect(fn("addTasks")).toHaveBeenCalledWith({
    tasks: [{ title: "Call plumber", due: "2026-03-11", time: "15:00", priority: "high", tags: ["home"], estimate_mins: 30, source: "you" }],
  });
  expect(input()).toHaveValue("");
});

it("quick add defaults the due date to today", async () => {
  await userEvent.type(input(), "Water plants");
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(fn("addTasks").mock.calls[0][0].tasks[0]).toMatchObject({ title: "Water plants", due: T, source: "you" });
});

it("quick add rejects an empty title", async () => {
  await userEvent.type(input(), "tomorrow 3pm{Enter}");
  expect(fn("addTasks")).not.toHaveBeenCalled();
  expect(input()).toHaveAttribute("aria-invalid", "true");
  expect(input()).toHaveValue("tomorrow 3pm");
});

it("a failed add restores the text and shows an error toast", async () => {
  fn("addTasks").mockRejectedValue(new Error("offline"));
  await userEvent.type(input(), "Call plumber{Enter}");
  await waitFor(() => expect(input()).toHaveValue("Call plumber"));
  const toast = screen.getByRole("status", { name: "Notice" });
  expect(toast).toHaveTextContent(/couldn.t add/i);
  expect(within(toast).queryByRole("button", { name: /undo/i })).toBeNull();
});

it("ticking updates the task, and Undo reverses it", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  expect(fn("updateTask")).toHaveBeenCalledWith({ id: report.id, patch: { done: true } });
  await userEvent.click(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i }));
  expect(fn("updateTask")).toHaveBeenLastCalledWith({ id: report.id, patch: { done: false } });
});

it("x on a focused docket ticks it", async () => {
  screen.getByRole("button", { name: "Open WRITE REPORT" }).focus();
  await userEvent.keyboard("x");
  expect(fn("updateTask")).toHaveBeenCalledWith({ id: report.id, patch: { done: true } });
});

it("a failed tick shows the error toast", async () => {
  fn("updateTask").mockRejectedValue(new Error("nope"));
  await userEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Notice" })).toHaveTextContent(/couldn.t save/i));
});

// A docket opens its ticket.
const openSheet = async (name = "Open WRITE REPORT") => {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog");
};

it("deleting asks for nothing more, then Undo re-adds the task and its block", async () => {
  const sheet = await openSheet();
  await userEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
  expect(fn("deleteTask")).toHaveBeenCalledWith({ id: report.id });
  fn("addTasks").mockResolvedValue({ created: [{ id: "re1", title: report.title, source: "jira", external_id: "CORE-9" }], skipped: [], errors: [] });
  await userEvent.click(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i }));
  expect(fn("addTasks")).toHaveBeenCalledWith({
    tasks: [{
      title: "Write report", description: null, note: "draft first", link: null, due: T, time: "09:00", priority: "high",
      estimate_mins: 90, tags: ["work", "q1"], source: "jira", external_id: "CORE-9",
    }],
  });
  await waitFor(() => expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: "re1", date: T, start: "09:00", mins: 60 }));
  expect(fn("updateTask")).toHaveBeenCalledWith({ id: "re1", patch: { sort_order: report.sort_order } });
});

it("Undo of a delete puts back the task's blocks on every loaded day", async () => {
  cleanup();
  state.board = {
    ...board(),
    blocks: [{ task_id: report.id, date: T, start: "09:00", mins: 60 }, { task_id: report.id, date: "2026-03-11", start: "14:00", mins: 30 }],
  };
  render(<App />);
  fn("addTasks").mockResolvedValue({ created: [{ id: "re1", title: report.title, source: "jira", external_id: "CORE-9" }], skipped: [], errors: [] });
  fn("updateTask").mockResolvedValue({});
  fn("deleteTask").mockResolvedValue({});
  fn("placeBlock").mockResolvedValue({});
  await userEvent.click(within(await openSheet()).getByRole("button", { name: "Delete" }));
  await userEvent.click(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i }));
  await waitFor(() => expect(fn("placeBlock")).toHaveBeenCalledTimes(2));
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: "re1", date: T, start: "09:00", mins: 60 });
  expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: "re1", date: "2026-03-11", start: "14:00", mins: 30 });
});

// Click a printed value to edit it in place; Enter keeps it.
const field = (ticket: HTMLElement, label: string) => within(ticket).getByRole("button", { name: new RegExp(`^${label}\\b.*Edit$`) });

it("the ticket edits in place: a title, a tag taken off, a tag put on, each saved alone", async () => {
  const ticket = await openSheet();
  await userEvent.click(field(ticket, "Title"));
  await userEvent.clear(within(ticket).getByLabelText("Title"));
  await userEvent.type(within(ticket).getByLabelText("Title"), "Write the report{Enter}");
  expect(fn("updateTask")).toHaveBeenLastCalledWith({ id: report.id, patch: { title: "Write the report" } });
  await userEvent.click(within(ticket).getByRole("button", { name: "Remove tag q1" }));
  expect(fn("updateTask")).toHaveBeenLastCalledWith({ id: report.id, patch: { tags: ["work"] } });
  await userEvent.type(within(ticket).getByRole("textbox", { name: "Add a tag" }), "q2{Enter}");
  expect(fn("updateTask")).toHaveBeenLastCalledWith({ id: report.id, patch: { tags: ["work", "q1", "q2"] } });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("a field left as it was saves nothing", async () => {
  const ticket = await openSheet();
  await userEvent.click(field(ticket, "Title"));
  await userEvent.keyboard("{Enter}");
  expect(fn("updateTask")).not.toHaveBeenCalled();
});

it("Escape puts a field back; a second Escape closes the ticket and focus returns to the docket", async () => {
  const opener = screen.getByRole("button", { name: "Open WRITE REPORT" });
  const ticket = await openSheet();
  await userEvent.click(field(ticket, "Title"));
  await userEvent.type(within(ticket).getByLabelText("Title"), "!!");
  await userEvent.keyboard("{Escape}");
  expect(within(ticket).queryByRole("textbox", { name: "Title" })).toBeNull();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fn("updateTask")).not.toHaveBeenCalled();
  expect(opener).toHaveFocus();
});

it("a server-side rejection restores the text and shows the first error", async () => {
  fn("addTasks").mockResolvedValue({ created: [], skipped: [], errors: [{ index: 0, error: "title: too long" }] });
  await userEvent.type(input(), "Call plumber{Enter}");
  await waitFor(() => expect(input()).toHaveValue("Call plumber"));
  expect(screen.getByRole("status", { name: "Notice" })).toHaveTextContent("title: too long");
});

it("an empty line marks the input invalid", async () => {
  await userEvent.type(input(), "{Enter}");
  expect(input()).toHaveAttribute("aria-invalid", "true");
  expect(fn("addTasks")).not.toHaveBeenCalled();
});

it("a docket still waiting for its real id is inert", async () => {
  cleanup();
  state.board = { ...board(), tasks: [task({ id: "optimistic-1", title: "Fresh one" } as any)] };
  render(<App />);
  const bump = screen.getByRole("button", { name: "Mark done: FRESH ONE" });
  expect(bump).toBeDisabled();
  expect(screen.getByRole("button", { name: "Open FRESH ONE" })).toBeDisabled();
  expect(screen.getByRole("article", { name: "FRESH ONE" }).closest("li")).toHaveAttribute("aria-busy", "true");
  fireEvent.click(bump);
  expect(fn("updateTask")).not.toHaveBeenCalled();
});

it("a bad estimate keeps the field open with what is wrong", async () => {
  const ticket = await openSheet();
  await userEvent.click(field(ticket, "Estimate"));
  await userEvent.clear(within(ticket).getByLabelText("Estimate"));
  await userEvent.type(within(ticket).getByLabelText("Estimate"), "abc{Enter}");
  expect(within(ticket).getByLabelText("Estimate")).toHaveAttribute("aria-invalid", "true");
  expect(within(ticket).getByRole("alert")).toHaveTextContent("Like 45m or 1h 30m");
  expect(fn("updateTask")).not.toHaveBeenCalled();
});

it("a refused save opens the field again with what was typed, and says so", async () => {
  fn("updateTask").mockRejectedValue(new Error("nope"));
  const ticket = await openSheet();
  await userEvent.click(field(ticket, "Title"));
  await userEvent.type(within(ticket).getByLabelText("Title"), "!{Enter}");
  await waitFor(() => expect(within(screen.getByRole("dialog")).getByLabelText("Title")).toHaveValue("Write report!"));
  expect(screen.getByRole("status", { name: "Notice" })).toHaveTextContent(/couldn.t save/i);
});

it("the undo toast shows at once, before the write resolves", () => {
  fn("updateTask").mockReturnValue(new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  expect(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i })).toBeInTheDocument();
});

it("focusing Undo holds the countdown", () => {
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  const undo = within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i });
  act(() => undo.focus());
  act(() => void vi.advanceTimersByTime(8000));
  expect(screen.getByRole("status", { name: "Notice" })).toHaveTextContent("Done");
  act(() => undo.blur());
  act(() => void vi.advanceTimersByTime(5100));
  expect(screen.getByRole("status", { name: "Notice" })).toBeEmptyDOMElement();
});

it("after Delete focus goes to quick add", async () => {
  const sheet = await openSheet();
  await userEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
  expect(input()).toHaveFocus();
});

it("Undo still goes through offline (Convex queues it), and the stamp reads unsaved while writes wait", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  try {
    state.inflight = true;
    fireEvent(window, new Event("offline"));
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("status", { name: "Notice" })).getByRole("button", { name: /undo/i }));
    expect(fn("updateTask")).toHaveBeenLastCalledWith({ id: report.id, patch: { done: false } });
  } finally {
    state.inflight = false;
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    fireEvent(window, new Event("online"));
  }
});

it("offline, writes are blocked and nothing is sent", async () => {
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  try {
    fireEvent(window, new Event("offline"));
    expect(input()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Done: Write report/ }));
    expect(screen.getByRole("button", { name: /Mark done: EMAIL LANDLORD/ })).toBeDisabled();
    expect(fn("updateTask")).not.toHaveBeenCalled();
    expect(fn("addTasks")).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    fireEvent(window, new Event("online"));
  }
});
