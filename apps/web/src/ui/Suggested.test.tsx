import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown>, fns: {} as Record<string, any> }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: any) => state.data[getFunctionName(ref)],
    useMutation: (ref: any) => {
      const name = getFunctionName(ref);
      if (!state.fns[name]) {
        const fn: any = vi.fn().mockResolvedValue({});
        fn.withOptimisticUpdate = () => fn;
        state.fns[name] = fn;
      }
      return state.fns[name];
    },
  };
});

import { Suggested } from "./Suggested";

const item = (o: Record<string, unknown>) => ({
  id: "s1", origin: "jira", title: "Fix login redirect", description: "Users bounce to /", note: "Acme · Bug",
  link: "https://acme.atlassian.net/browse/ACME-7", source: "jira", external_id: "jira:ACME-7", due: "2026-10-20", time: null,
  priority: "high", estimate_mins: 90, tags: ["work"], epic_id: null, status: "doing", checklist: [], created_at: 1,
  raised_at: null, project: "Acme", alike: [], ...o,
});
const list = (items: unknown[]) => ({
  today: "2026-10-14", epics: [],
  tasks: [{ id: "t1", title: "Login bug", due: null, epic_id: null }, { id: "t2", title: "Book dentist", due: null, epic_id: null }],
  items,
});
const fn = (name: string) => state.fns[name] as ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  state.fns = {};
  state.data = { "inbox:list": list([item({ alike: [{ id: "t1", title: "Login bug", score: 0.6 }] })]), "jira:link": null };
});
afterEach(cleanup);

it("shows a Jira suggestion with what it carries over", () => {
  render(<Suggested />);
  const card = screen.getByRole("article", { name: "Fix login redirect" });
  expect(within(card).getByText(/^JIRA\s+ACME-7$/)).toBeInTheDocument();
  expect(within(card).getByText("~1h 30m")).toBeInTheDocument();
  expect(within(card).getByText("Users bounce to /")).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: /Open in Jira/ })).toHaveAttribute("href", "https://acme.atlassian.net/browse/ACME-7");
});

it("accepts, rejects, and combines into a lookalike, each with undo", async () => {
  render(<Suggested />);
  await userEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(fn("inbox:acceptOne")).toHaveBeenCalledWith({ id: "s1" });
  await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
  expect(fn("inbox:undoOne")).toHaveBeenCalledWith({ id: "s1" });
  await userEvent.click(screen.getByRole("button", { name: "Reject" }));
  expect(fn("inbox:rejectOne")).toHaveBeenCalledWith({ id: "s1" });
  await userEvent.click(screen.getByRole("button", { name: "Login bug" }));
  expect(fn("inbox:combineOne")).toHaveBeenCalledWith({ id: "s1", task_id: "t1" });
});

it("edits a suggestion on its ticket and accepts it with the changes; closing the ticket cancels", async () => {
  render(<Suggested />);
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const ticket = await screen.findByRole("dialog", { hidden: true });
  expect(within(ticket).getByText("FIX LOGIN REDIRECT")).toBeInTheDocument();
  await userEvent.click(within(ticket).getByRole("button", { name: "Close", hidden: true }));
  expect(fn("inbox:acceptOne")).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  const again = await screen.findByRole("dialog", { hidden: true });
  await userEvent.click(within(again).getByRole("button", { name: "LOW", hidden: true }));
  await userEvent.click(within(again).getByRole("button", { name: "Accept", hidden: true }));
  expect(fn("inbox:acceptOne")).toHaveBeenCalledWith({ id: "s1", edits: expect.objectContaining({ title: "Fix login redirect", priority: "low", due: "2026-10-20" }) });
});

it("combines into any open task found by search", async () => {
  render(<Suggested />);
  await userEvent.click(screen.getByRole("button", { name: "Combine…" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Find a task to combine into" }), "dent");
  await userEvent.click(screen.getByRole("button", { name: "Book dentist" }));
  expect(fn("inbox:combineOne")).toHaveBeenCalledWith({ id: "s1", task_id: "t2" });
});

const titles = () => screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));
const DAY = 86_400_000;

it("keeps a pile per source, and a new source gets its own", async () => {
  const now = Date.now();
  state.data["inbox:list"] = list([
    item({ id: "j1", title: "Jira one", created_at: now }),
    item({ id: "a1", origin: "agent", source: "you", external_id: null, title: "Claude one", created_at: now - DAY }),
    item({ id: "g1", origin: "github", source: "github", external_id: "gh:1", title: "GitHub one", created_at: now - 2 * DAY }),
  ]);
  render(<Suggested />);
  const piles = screen.getByRole("group", { name: "Sources" });
  expect(within(piles).getAllByRole("button").map((b) => b.textContent)).toEqual(["All3", "Jira1", "Claude1", "Github1"]);
  expect(titles()).toEqual(["Jira one", "Claude one", "GitHub one"]);
  await userEvent.click(within(piles).getByRole("button", { name: /Claude/ }));
  expect(titles()).toEqual(["Claude one"]);
  expect(screen.queryByRole("button", { name: "Jira settings" })).toBeNull(); // Jira's pile says how the link is, and where it's set up
  await userEvent.click(within(piles).getByRole("button", { name: /Jira/ }));
  expect(titles()).toEqual(["Jira one"]);
  expect(screen.getByText("not linked")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Jira settings" })).toBeInTheDocument();
});

it("sorts by when the source raised it, priority, due date or project, and remembers the choice", async () => {
  const now = Date.now();
  state.data["inbox:list"] = list([
    item({ id: "1", title: "Old high", priority: "high", raised_at: now - 40 * DAY, created_at: now, due: null, project: "Zeta" }),
    item({ id: "2", title: "New low", priority: "low", raised_at: now - DAY, created_at: now, due: "2026-10-16", project: "Acme" }),
    item({ id: "3", title: "Mid none", priority: null, raised_at: now - 5 * DAY, created_at: now, due: "2026-10-15", project: null }),
  ]);
  render(<Suggested />);
  expect(titles()).toEqual(["New low", "Mid none", "Old high"]);
  expect(screen.getByRole("article", { name: "New low" })).toHaveTextContent("raised yesterday");
  const sort = screen.getByRole("combobox", { name: "Sort" });
  await userEvent.selectOptions(sort, "oldest");
  expect(titles()).toEqual(["Old high", "Mid none", "New low"]);
  await userEvent.selectOptions(sort, "priority");
  expect(titles()).toEqual(["Old high", "New low", "Mid none"]);
  await userEvent.selectOptions(sort, "due");
  expect(titles()).toEqual(["Mid none", "New low", "Old high"]);
  await userEvent.selectOptions(sort, "project");
  expect(titles()).toEqual(["New low", "Old high", "Mid none"]); // no project last
  cleanup();
  render(<Suggested />);
  expect(screen.getByRole("combobox", { name: "Sort" })).toHaveValue("project");
});
