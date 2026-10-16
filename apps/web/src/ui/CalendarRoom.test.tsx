import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return { useQuery: (ref: any) => state.data[getFunctionName(ref)], useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate() { return this; } }) };
});
vi.mock("./PlanSheet", () => ({ PlanSheet: ({ date }: { date: string }) => <div role="dialog" aria-label={`Plan ${date}`} /> }));

import { CalendarRoom } from "./CalendarRoom";
import type { WorkActions } from "../lib/useWork";
import type { Everything } from "../lib/stats";

const task = (o: Partial<FullTask>) => ({
  id: "t", title: "T", due: null, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 0,
  epic_id: null, status: "todo", tags: [], source: "you", external_id: null, link: null, note: null, description: null, checklist: [],
  created_on: "2026-10-01", touched_on: "2026-10-01", ...o,
}) as Everything["tasks"][number];

const all: Everything = {
  today: "2026-10-16", nowM: 600, epics: [], blocks: [],
  tasks: [
    task({ id: "u1", title: "Someday thing" }),
    ...[1, 2, 3, 4, 5, 6].map((i) => task({ id: `d${i}`, title: `Busy ${i}`, due: "2026-10-20", sort_order: i })),
    task({ id: "x", title: "Dentist prep", due: "2026-10-16", time: "09:00" }),
  ],
};
const actions = { offline: false, toast: null, dismiss: vi.fn(), move: vi.fn(), save: vi.fn(), add: vi.fn(), remove: vi.fn() } as unknown as WorkActions;

afterEach(cleanup);

it("prints the month with its tasks and events, the undated in the tray, and folds a full day into +n", async () => {
  state.data["calendar:month"] = [{ date: "2026-10-16", events: [{ start: "10:00", end: "11:00", title: "Dentist", colour: "rose" }] }];
  render(<CalendarRoom all={all} actions={actions} />);
  expect(screen.getByText("October 2026")).toBeInTheDocument();
  const day = screen.getByRole("gridcell", { name: "Friday 16 Oct" });
  expect(within(day).getByText("Dentist prep")).toBeInTheDocument();
  expect(within(day).getByText("Dentist").closest(".cal-ev")).toHaveClass("has-cal");
  expect(within(screen.getByRole("complementary", { name: "No due date" })).getByText("Someday thing")).toBeInTheDocument();

  const busy = screen.getByRole("gridcell", { name: "Tuesday 20 Oct" });
  expect(within(busy).getAllByRole("listitem")).toHaveLength(3); // four fit: three and the count
  await userEvent.click(within(busy).getByRole("button", { name: "3 more on Tuesday 20 Oct" }));
  const pop = screen.getByRole("dialog", { name: "Tuesday 20 Oct, 3 more" });
  expect(within(pop).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Busy 4", "Busy 5", "Busy 6"]);
  await userEvent.click(within(pop).getByText("Busy 5"));
  expect(screen.getByRole("dialog", { name: /Busy 5/i })).toBeInTheDocument(); // its ticket
});

it("a day's + makes a task on that day, and Plan opens its planner", async () => {
  state.data["calendar:month"] = [];
  render(<CalendarRoom all={all} actions={actions} />);
  await userEvent.click(screen.getByRole("button", { name: "Plan Thursday 22 Oct" }));
  expect(screen.getByRole("dialog", { name: "Plan 2026-10-22" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "New task on Thursday 22 Oct" }));
  expect(document.querySelector(".sheet-ticket")).toBeTruthy();
});

it("steps through the months", async () => {
  state.data["calendar:month"] = [];
  render(<CalendarRoom all={all} actions={actions} />);
  await userEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByText("November 2026")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(screen.getByText("October 2026")).toBeInTheDocument();
});
