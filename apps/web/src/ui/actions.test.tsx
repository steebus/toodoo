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
  const toast = screen.getByRole("status");
  expect(toast).toHaveTextContent(/couldn.t add/i);
  expect(within(toast).queryByRole("button", { name: /undo/i })).toBeNull();
});

it("ticking updates the task, and Undo reverses it", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  expect(fn("updateTask")).toHaveBeenCalledWith({ id: report.id, patch: { done: true } });
  await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: /undo/i }));
  expect(fn("updateTask")).toHaveBeenLastCalledWith({ id: report.id, patch: { done: false } });
});

it("x on a focused docket ticks it", async () => {
  screen.getByRole("button", { name: "Edit WRITE REPORT" }).focus();
  await userEvent.keyboard("x");
  expect(fn("updateTask")).toHaveBeenCalledWith({ id: report.id, patch: { done: true } });
});

it("a failed tick shows the error toast", async () => {
  fn("updateTask").mockRejectedValue(new Error("nope"));
  await userEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/couldn.t save/i));
});

const openSheet = async (name = "Edit WRITE REPORT") => {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog");
};

it("deleting asks for nothing more, then Undo re-adds the task and its block", async () => {
  const sheet = await openSheet();
  await userEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
  expect(fn("deleteTask")).toHaveBeenCalledWith({ id: report.id });
  fn("addTasks").mockResolvedValue({ created: [{ id: "re1", title: report.title, source: "jira", external_id: "CORE-9" }], skipped: [], errors: [] });
  await userEvent.click(within(screen.getByRole("status")).getByRole("button", { name: /undo/i }));
  expect(fn("addTasks")).toHaveBeenCalledWith({
    tasks: [{
      title: "Write report", description: null, note: "draft first", link: null, due: T, time: "09:00", priority: "high",
      estimate_mins: 90, tags: ["work", "q1"], source: "jira", external_id: "CORE-9",
    }],
  });
  await waitFor(() => expect(fn("placeBlock")).toHaveBeenCalledWith({ task_id: "re1", date: T, start: "09:00", mins: 60 }));
});

it("the edit sheet saves only the changed fields", async () => {
  const sheet = await openSheet();
  expect(within(sheet).getByLabelText("Estimate")).toHaveValue("1h 30m");
  await userEvent.clear(within(sheet).getByLabelText("Title"));
  await userEvent.type(within(sheet).getByLabelText("Title"), "Write the report");
  await userEvent.clear(within(sheet).getByLabelText("Tags"));
  await userEvent.type(within(sheet).getByLabelText("Tags"), "work, q2");
  await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  expect(fn("updateTask")).toHaveBeenCalledWith({ id: report.id, patch: { title: "Write the report", tags: ["work", "q2"] } });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("saving with no changes just closes", async () => {
  const sheet = await openSheet();
  await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  expect(fn("updateTask")).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("Escape closes the sheet without saving and focus returns to the docket", async () => {
  const opener = screen.getByRole("button", { name: "Edit WRITE REPORT" });
  const sheet = await openSheet();
  await userEvent.type(within(sheet).getByLabelText("Title"), "!!");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fn("updateTask")).not.toHaveBeenCalled();
  expect(opener).toHaveFocus();
});

it("a server-side rejection restores the text and shows the first error", async () => {
  fn("addTasks").mockResolvedValue({ created: [], skipped: [], errors: [{ index: 0, error: "title: too long" }] });
  await userEvent.type(input(), "Call plumber{Enter}");
  await waitFor(() => expect(input()).toHaveValue("Call plumber"));
  expect(screen.getByRole("status")).toHaveTextContent("title: too long");
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
  expect(screen.getByRole("button", { name: "Edit FRESH ONE" })).toBeDisabled();
  expect(screen.getByRole("article", { name: "FRESH ONE" }).closest("li")).toHaveAttribute("aria-busy", "true");
  fireEvent.click(bump);
  expect(fn("updateTask")).not.toHaveBeenCalled();
});

it("a bad estimate keeps the sheet open", async () => {
  const sheet = await openSheet();
  await userEvent.clear(within(sheet).getByLabelText("Estimate"));
  await userEvent.type(within(sheet).getByLabelText("Estimate"), "abc");
  await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(within(sheet).getByLabelText("Estimate")).toHaveAttribute("aria-invalid", "true");
  expect(fn("updateTask")).not.toHaveBeenCalled();
});

it("a rejected save reopens the sheet with the draft and shows the error", async () => {
  fn("updateTask").mockRejectedValue(new Error("nope"));
  const sheet = await openSheet();
  await userEvent.type(within(sheet).getByLabelText("Title"), "!");
  await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  expect(within(screen.getByRole("dialog")).getByLabelText("Title")).toHaveValue("Write report!");
  expect(screen.getByRole("status")).toHaveTextContent(/couldn.t save/i);
});

it("the undo toast shows at once, before the write resolves", () => {
  fn("updateTask").mockReturnValue(new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  expect(within(screen.getByRole("status")).getByRole("button", { name: /undo/i })).toBeInTheDocument();
});

it("focusing Undo holds the countdown", () => {
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Mark done: WRITE REPORT" }));
  const undo = within(screen.getByRole("status")).getByRole("button", { name: /undo/i });
  act(() => undo.focus());
  act(() => void vi.advanceTimersByTime(8000));
  expect(screen.getByRole("status")).toHaveTextContent("Done");
  act(() => undo.blur());
  act(() => void vi.advanceTimersByTime(5100));
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("after Delete focus goes to quick add", async () => {
  const sheet = await openSheet();
  await userEvent.click(within(sheet).getByRole("button", { name: "Delete" }));
  expect(input()).toHaveFocus();
});
