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

const pic = () => new File(["png"], "site.png", { type: "image/png" });

it("puts shared pictures on the task it adds, or on the one already there", async () => {
  globalThis.URL.createObjectURL ??= () => "blob:x";
  globalThis.URL.revokeObjectURL ??= () => {};
  const add = vi.fn(async () => ({ created: [{ id: "new1" }], errors: [] }));
  const attach = vi.fn(async () => []);
  render(<ShareForm shared={{ files: 1 }} epics={[]} offline={false} add={add} files={[pic()]} tasks={[]} attach={attach} />);
  expect(screen.getByRole("list", { name: "Shared files" })).toContainElement(screen.getByRole("img", { name: "site.png" }));
  const line = screen.getByRole("textbox", { name: "New to do" }); // the add line and its dials, not the long form
  expect(line).toHaveFocus();
  expect(screen.getByRole("group", { name: "Add details" })).toBeInTheDocument();
  await userEvent.type(line, "Quote the deck tomorrow !high");
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(add).toHaveBeenCalledWith([expect.objectContaining({ title: "Quote the deck", priority: "high", due: expect.any(String) })]);
  expect(attach).toHaveBeenCalledWith("new1", [expect.any(File)]);
  expect(await screen.findByRole("status")).toHaveTextContent("AddedQUOTE THE DECKwith 1 file");
  cleanup();

  const again = vi.fn(async () => ({ created: [], skipped: [{ id: "old7" }], errors: [] }));
  render(<ShareForm shared={{ url: "https://acme.atlassian.net/browse/CROOZ-7", title: "[CROOZ-7] Fix", files: 1 }} epics={[]} offline={false}
    add={again} files={[pic()]} tasks={[]} attach={attach} />);
  expect(screen.getByRole("textbox", { name: "New to do" })).toHaveValue("CROOZ-7 Fix "); // what came with it
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(again).toHaveBeenCalledWith([expect.objectContaining({ source: "jira", external_id: "jira:CROOZ-7" })]);
  expect(attach).toHaveBeenLastCalledWith("old7", [expect.any(File)]);
  expect(await screen.findByRole("status")).toHaveTextContent("Already on your list");
});

it("puts shared pictures on an open task found by its words", async () => {
  globalThis.URL.createObjectURL ??= () => "blob:x";
  globalThis.URL.revokeObjectURL ??= () => {};
  const add = vi.fn();
  const attach = vi.fn(async () => []);
  const tasks = [
    { id: "a", title: "Fix the deck", due: null }, { id: "b", title: "Quote the deck", due: "2026-10-20" }, { id: "c", title: "Ring Sam", due: null },
  ];
  render(<ShareForm shared={{ files: 2 }} epics={[]} offline={false} add={add} files={[pic(), pic()]} tasks={tasks} attach={attach} />);
  await userEvent.click(screen.getByRole("button", { name: "Add to a task" }));
  const list = () => screen.getByRole("list", { name: "Open tasks" });
  expect(list()).toHaveTextContent(/QUOTE THE DECK.*FIX THE DECK.*RING SAM/); // dated first
  await userEvent.type(screen.getByRole("searchbox", { name: "Find a task" }), "deck fix");
  expect(list().querySelectorAll("li")).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: /FIX THE DECK/ }));
  expect(attach).toHaveBeenCalledWith("a", [expect.any(File), expect.any(File)]);
  expect(add).not.toHaveBeenCalled();
  expect(await screen.findByRole("status")).toHaveTextContent("Attached toFIX THE DECK2 files");
});

it("stays on the pick, and says why, when none of the files would go on", async () => {
  const attach = vi.fn(async () => ["site.png: a task holds up to 30 files"]);
  render(<ShareForm shared={{ files: 1 }} epics={[]} offline={false} add={vi.fn()} files={[new File(["x"], "a.pdf")]}
    tasks={[{ id: "a", title: "Full one", due: null }]} attach={attach} />);
  await userEvent.click(screen.getByRole("button", { name: "Add to a task" }));
  await userEvent.click(screen.getByRole("button", { name: /FULL ONE/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("a task holds up to 30 files");
  expect(screen.queryByRole("status")).toBeNull();
});
