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
  priority: "high", estimate_mins: 90, tags: ["work"], epic_id: null, status: "doing", checklist: [], created_at: 1, alike: [], ...o,
});
const list = (items: unknown[]) => ({
  today: "2026-10-14", epics: [],
  tasks: [{ id: "t1", title: "Login bug", due: null, epic_id: null }, { id: "t2", title: "Book dentist", due: null, epic_id: null }],
  items,
});
const fn = (name: string) => state.fns[name] as ReturnType<typeof vi.fn>;

beforeEach(() => {
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

it("combines into any open task found by search", async () => {
  render(<Suggested />);
  await userEvent.click(screen.getByRole("button", { name: "Combine…" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Find a task to combine into" }), "dent");
  await userEvent.click(screen.getByRole("button", { name: "Book dentist" }));
  expect(fn("inbox:combineOne")).toHaveBeenCalledWith({ id: "s1", task_id: "t2" });
});

it("links Jira from the room", async () => {
  state.data["inbox:list"] = list([]);
  render(<Suggested />);
  expect(screen.getByText("Nothing waiting")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Link Jira" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Site" }), "acme");
  await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "steve@example.com");
  await userEvent.type(screen.getByLabelText(/API token/), "tok");
  await userEvent.click(screen.getByRole("button", { name: "Link Jira" }));
  expect(fn("jira:save")).toHaveBeenCalledWith({ site: "acme", email: "steve@example.com", token: "tok", jql: "" });
});
