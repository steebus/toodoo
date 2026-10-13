import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "./types";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
const state = vi.hoisted(() => ({ board: null as unknown }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: any) => children,
  Unauthenticated: () => null,
  AuthLoading: () => null,
  useConvexConnectionState: () => ({ hasEverConnected: true, isWebSocketConnected: true }),
  useQuery: () => state.board,
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate() { return this; } }),
}));

import { App } from "../App";

const T = "2026-03-10";
let n = 0;
const task = (o: Partial<FullTask> & { title: string }): FullTask => ({
  id: `task${++n}`, due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: n,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, ...o,
});

const report = task({ title: "Write report", time: "09:00", priority: "high", estimate_mins: 60, tags: ["work"] });
const review = task({ title: "Review pull requests", source: "jira", external_id: "CORE-12", tags: ["work", "code", "dev", "extra"] });
const landlord = task({ title: "Email landlord", source: "gmail", time: "15:30" });

const board = (o: Partial<BoardData> = {}): BoardData => ({
  today: T,
  date: T,
  nowM: 10 * 60 + 30,
  app_url: null,
  day: {
    date: T,
    headline: "Standup, then focus time.",
    events: [{ start: "09:15", end: "09:45", title: "Team standup" }, { allDay: true, title: "Public holiday" }],
  },
  tasks: [
    task({ title: "File expenses", due: "2026-03-05" }),
    task({ title: "Book dentist", due: "2026-03-08" }),
    report, review, landlord,
    task({ title: "Pay invoice", done: true, done_on: T }),
    task({ title: "Plan holiday", due: "2026-03-14" }),
  ],
  blocks: [{ task_id: report.id, date: T, start: "09:00", mins: 60 }],
  suggestions: [
    { id: report.id, title: report.title, reasons: ["High priority", "Fixed time"] },
    { id: review.id, title: review.title, reasons: ["Keeps work moving"] },
  ],
  ...o,
});

const show = (b: BoardData = board()) => {
  state.board = b;
  return render(<App />);
};
const rail = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("renders the header from the board", () => {
  show();
  expect(screen.getByRole("heading", { level: 1, name: "Tuesday 10 March" })).toBeInTheDocument();
  expect(screen.getByText("Standup, then focus time.")).toBeInTheDocument();
  // The count has gone; Focus has its place (nothing is on the line in this board, so it waits).
  expect(screen.getByRole("button", { name: /Focus/ })).toBeDisabled();
});

it("the date's chevron opens the day menu: theme, share and sign out", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: /Tuesday 10 March/ }));
  const menu = screen.getByRole("menu", { name: "Day menu" });
  expect(within(menu).getAllByRole("menuitem").map((x) => x.textContent?.trim())).toEqual(["Auto", "Share to toodoo", "Sign out"]);
  const theme = within(menu).getByRole("menuitem", { name: /^Theme: Auto/ });
  await userEvent.click(theme);
  expect(within(menu).getByRole("menuitem", { name: /^Theme: Light/ })).toBeInTheDocument();
  expect(document.documentElement.dataset.theme).toBe("light");
});

it("lists each status group with its count", () => {
  show();
  expect(within(rail("CARRIED OVER")).getByText("2")).toBeInTheDocument();
  expect(within(rail("TODAY")).getByText("3")).toBeInTheDocument();
  expect(within(rail("DONE TODAY")).getByText("1")).toBeInTheDocument();
  expect(within(rail("COMING UP")).getByText("1")).toBeInTheDocument();
  expect(within(rail("TODAY")).getAllByRole("article")).toHaveLength(3);
});

it("shows waiting days on carried dockets", () => {
  show();
  const d = screen.getByRole("article", { name: "FILE EXPENSES" });
  // In red over the title, where a kicker would be: the figure, not a label.
  expect(within(d).getByText("5 DAYS")).toHaveClass("dk-tag");
  expect(within(d).queryByText("CARRIED OVER")).not.toBeInTheDocument();
});

it("shows at most three tags and a mono source label", () => {
  show();
  const d = screen.getByRole("article", { name: "REVIEW PULL REQUESTS" });
  expect(within(d).getByText("WORK CODE DEV")).toBeInTheDocument();
  expect(within(d).getByText(/^JIRA\s+CORE-12$/)).toBeInTheDocument();
  expect(within(screen.getByRole("article", { name: "EMAIL LANDLORD" })).getByText("GMAIL")).toBeInTheDocument();
});

it("puts the biro ring on the top suggestion only", () => {
  show();
  const rings = screen.getAllByTestId("biro-ring");
  expect(rings).toHaveLength(1);
  expect(screen.getByRole("article", { name: "WRITE REPORT" }).closest("li")).toContainElement(rings[0]);
});

it("opens a docket as a ticket, with its actions on it", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: "Open WRITE REPORT" }));
  const ticket = screen.getByRole("dialog", { name: "WRITE REPORT" });
  expect(within(ticket).getByText("! HIGH")).toBeInTheDocument();
  for (const name of ["Done", "Plan it", "Delete"]) expect(within(ticket).getByRole("button", { name })).toBeInTheDocument();
  expect(within(ticket).getByRole("button", { name: "! HIGH" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("lists next up with the first reason, and Plan all is ready", () => {
  show();
  const next = screen.getByRole("region", { name: "NEXT UP" });
  expect(within(next).getByText("Write report")).toBeInTheDocument();
  expect(within(next).getByText(/High priority/)).toBeInTheDocument();
  expect(within(next).queryByText(/Fixed time/)).not.toBeInTheDocument();
  expect(within(next).getByRole("button", { name: "Plan all" })).toBeEnabled();
});

it("keeps coming up collapsed until its chevron is pressed", async () => {
  show();
  const chevron = screen.getByRole("button", { name: "Show coming up" });
  expect(chevron).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("article", { name: "PLAN HOLIDAY" })).not.toBeInTheDocument();
  await userEvent.click(chevron);
  expect(screen.getByRole("button", { name: "Hide coming up" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("article", { name: "PLAN HOLIDAY" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Hide coming up" }));
  expect(screen.queryByRole("article", { name: "PLAN HOLIDAY" })).not.toBeInTheDocument();
});

it("spans the first and last time of the dockets in view", () => {
  show();
  expect(screen.getByLabelText("From 9:00 to 3:30")).toBeInTheDocument();
});

it("regroups from the View menu and remembers the choice", async () => {
  const { unmount } = show();
  await userEvent.click(screen.getByRole("button", { name: "View" }));
  await userEvent.selectOptions(screen.getByLabelText("Group"), "priority");
  expect(screen.getByRole("region", { name: /^HIGH/ })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: /^NO PRIORITY/ })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /^CARRIED OVER/ })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem("toodoo.view")!)).toMatchObject({ group: "priority" });
  unmount();
  show();
  expect(screen.getByRole("region", { name: /^HIGH/ })).toBeInTheDocument();
});

it("filters by tag from the View menu", async () => {
  show();
  await userEvent.click(screen.getByRole("button", { name: "View" }));
  await userEvent.selectOptions(screen.getByLabelText("Tag"), "work");
  expect(screen.getByRole("article", { name: "WRITE REPORT" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: "EMAIL LANDLORD" })).not.toBeInTheDocument();
});

it("lays the day plan out from start and length", () => {
  show();
  const plan = within(screen.getByRole("list", { name: "Plan" }));
  expect(plan.getByText("Team standup")).toBeInTheDocument();
  expect(plan.getByText(/Write report/)).toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "All day" })).getByText("Public holiday")).toBeInTheDocument();
  // The 9:15 event overlaps the 9:00 block, so each takes half a lane.
  const lane = plan.getAllByRole("listitem").find((li) => li.textContent?.includes("Team standup"))!;
  expect(lane.style.width).toContain("/ 2");
});

it("draws the red now-line only on today", () => {
  const { unmount } = show();
  expect(screen.getByLabelText("Now 10:30")).toBeInTheDocument();
  unmount();
  show(board({ date: "2026-03-11" }));
  expect(screen.queryByLabelText(/^Now /)).not.toBeInTheDocument();
});

it("marks only a high priority line as high in quick add", async () => {
  show();
  const input = screen.getByRole("textbox", { name: "New to do" });
  await userEvent.type(input, "Call plumber !low");
  expect(document.querySelector(".chip-high")).toBeNull();
  await userEvent.clear(input);
  await userEvent.type(input, "Call plumber !high");
  expect(document.querySelector(".chip-high")).not.toBeNull();
});

it("renders the frame with both panel headings while the board loads", () => {
  state.board = undefined;
  render(<App />);
  expect(screen.getByRole("heading", { name: "Day plan" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "To do" })).toBeInTheDocument();
});

it("shows All when the stored tag is on no task, but keeps the tag for a later board", () => {
  localStorage.setItem("toodoo.view", JSON.stringify({ group: "status", sort: "manual", tag: "gone" }));
  show();
  expect(within(rail("TODAY")).getAllByRole("article")).toHaveLength(3);
  expect(JSON.parse(localStorage.getItem("toodoo.view")!).tag).toBe("gone");
});

it("shows All in the tag select after a stale tag resets", async () => {
  localStorage.setItem("toodoo.view", JSON.stringify({ group: "status", sort: "manual", tag: "gone" }));
  show();
  await userEvent.click(screen.getByRole("button", { name: "View" }));
  expect(screen.getByLabelText("Tag")).toHaveValue("");
});

it("widens the day plan to include the now-line hour", () => {
  show(board({ nowM: 22 * 60 + 30 }));
  const hours = within(screen.getByRole("list", { name: "Hours" })).getAllByRole("listitem").map((l) => l.textContent);
  expect(hours.at(-1)).toBe("11pm");
  expect(screen.getByLabelText("Now 10:30")).toBeInTheDocument();
});

it("folds done today away, and remembers it folded", async () => {
  const done = task({ title: "Pay rent", done: true, done_on: T });
  const b = board({ tasks: [...board().tasks, done] });
  show(b);
  expect(screen.getByRole("article", { name: "PAY RENT" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Hide done today" }));
  expect(screen.queryByRole("article", { name: "PAY RENT" })).not.toBeInTheDocument();
  cleanup();
  show(b);
  expect(screen.getByRole("button", { name: "Show done today" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("article", { name: "PAY RENT" })).not.toBeInTheDocument();
});
