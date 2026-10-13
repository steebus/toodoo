import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Epic } from "@shared/epics.ts";
import { ShareForm } from "./ShareRoom";

afterEach(cleanup);
const epics: Epic[] = [{ id: "c", title: "Crooz", description: null, priority: "high", status: "active", sort_order: 0, colour: "blue" }];

it("turns a shared Jira issue into a task to check, then adds it", async () => {
  const add = vi.fn(async () => ({ created: [{}], errors: [] }));
  render(<ShareForm shared={{ url: "https://acme.atlassian.net/browse/CROOZ-7", title: "[CROOZ-7] Fix the build - Jira", text: "Urgent, due Friday" }}
    epics={epics} offline={false} add={add} />);
  expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("CROOZ-7 Fix the build");
  expect(screen.getByRole("combobox", { name: "Epic" })).toHaveValue("c");
  expect(screen.getByRole("combobox", { name: "Priority" })).toHaveValue("high");
  expect(screen.getByRole("list", { name: "Noticed" })).toHaveTextContent("Jira CROOZ-7");
  await userEvent.clear(screen.getByRole("textbox", { name: "Title" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "CROOZ-7 Fix the build today");
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(add).toHaveBeenCalledWith([expect.objectContaining({
    title: "CROOZ-7 Fix the build today", source: "jira", external_id: "jira:CROOZ-7", epic_id: "c", priority: "high", tags: ["work"],
  })]);
  expect(await screen.findByRole("status")).toHaveTextContent("Added");
});

it("says so when the issue is already on the list", async () => {
  const add = vi.fn(async () => ({ created: [], errors: [] }));
  render(<ShareForm shared={{ url: "https://acme.atlassian.net/browse/CROOZ-7", title: "[CROOZ-7] Fix" }} epics={[]} offline={false} add={add} />);
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Already on your list");
});
