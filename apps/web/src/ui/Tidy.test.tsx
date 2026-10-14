import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Everything } from "../lib/stats";
import type { WorkActions } from "../lib/useWork";
import { Tidy } from "./Tidy";

const T = "2026-10-14";
const task = (id: string, o: Partial<Everything["tasks"][number]> = {}): Everything["tasks"][number] => ({
  id, title: id, due: null, time: null, priority: null, estimate_mins: 30, done: false, done_on: null, sort_order: 1,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, epic_id: null, status: "todo",
  created_on: T, touched_on: T, ...o,
});
const actions = (): WorkActions => ({
  offline: false, toast: null, dismiss: vi.fn(), move: vi.fn(), save: vi.fn(async () => true), add: vi.fn(async () => true),
  remove: vi.fn(), createEpic: vi.fn(async () => true), updateEpic: vi.fn(async () => true), removeEpic: vi.fn(),
});
afterEach(cleanup);

it("deals undated tasks one at a time: a typed day files it, an empty Enter skips, a pick files the next", async () => {
  const a = actions();
  const all: Everything = { today: T, nowM: 600, epics: [], blocks: [], tasks: [task("First", { sort_order: 1 }), task("Second", { sort_order: 2 })] };
  render(<Tidy all={all} actions={a} />);
  expect(screen.getByRole("tab", { name: /No date/ })).toHaveAttribute("aria-selected", "true");
  const field = () => screen.getByRole("textbox");
  await userEvent.type(field(), "tomorrow{Enter}");
  expect(a.move).toHaveBeenLastCalledWith("First", { due: "2026-10-15" }, "Due Thu 15 Oct: First");
  expect(await screen.findByRole("heading", { name: "Second" })).toBeInTheDocument();
  await userEvent.type(field(), "{Enter}");
  expect(await screen.findByText("Round done")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Go round again" }));
  await userEvent.click(await screen.findByRole("button", { name: "Backlog" }));
  expect(a.move).toHaveBeenLastCalledWith("Second", { status: "backlog" }, "Backlog: Second");
});

it("a long-parked card says how long, and offers it back to To do by key", async () => {
  const a = actions();
  const all: Everything = { today: T, nowM: 600, epics: [], blocks: [], tasks: [task("Shelved", { status: "backlog", due: "2026-09-01", touched_on: "2026-09-01" })] };
  render(<Tidy all={all} actions={a} />);
  expect(screen.getByRole("tab", { name: /Gone quiet/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("43 DAYS IN BACKLOG")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Backlog/ })).toBeNull();
  await userEvent.keyboard("o");
  expect(a.move).toHaveBeenLastCalledWith("Shelved", { status: "todo" }, "To do: Shelved");
});
