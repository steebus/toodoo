import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";

const files = vi.hoisted(() => ({
  notes: [] as { id: string; parent_id: string | null; author: "steve" | "claude"; text: string; created_at: number }[],
  list: [] as { id: string; name: string; type: string; size: number; created_at: number; url: string }[],
  calls: [] as [string, unknown][],
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (ref: never) => (args: unknown) => { files.calls.push([getFunctionName(ref), args]); return Promise.resolve({}); },
    useQuery: (q: never, a: { id?: string; task_id?: string }) => a?.task_id ? (getFunctionName(q) === "notes:list" ? files.notes : files.list) : a?.id
    ? [{ id: "b1", date: "2026-10-14", start: "10:00", mins: 30 }, { id: "b2", date: "2026-10-16", start: "14:00", mins: 60 }]
    : [
      { date: "2026-10-15", start: "09:15", end: "09:45", title: "Croozn standup", where: null },
      { date: "2026-10-16", start: "14:00", end: "15:00", title: "Client demo", where: "Zoom" },
    ],
  };
});

import { TaskView } from "./TaskView";

afterEach(() => { cleanup(); files.list = []; files.notes = []; files.calls = []; });
const T = "2026-10-15";
const card = (o: Partial<FullTask> = {}): FullTask => ({
  id: "t1", title: "Demo script", due: null, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 1,
  source: "jira", external_id: "jira:ACME-4", tags: [], link: null, note: null, description: null, ...o,
});

it("makes a card the prep for a meeting from the week ahead", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<TaskView task={card()} today={T} onSave={onSave} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "+ PREP FOR A MEETING" }));
  const pick = screen.getByRole("combobox", { name: "Meeting" });
  await userEvent.selectOptions(pick, screen.getByRole("option", { name: /CLIENT DEMO/ }));
  expect(onSave).toHaveBeenCalledWith({ prep_for: { date: "2026-10-16", start: "14:00", title: "Client demo" } });
});

it("shows the meeting a card is prep for, and unlinks it", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<TaskView task={card({ prep_for: { date: T, start: "09:15", title: "Croozn standup" } })} today={T} onSave={onSave} onClose={() => {}} />);
  expect(screen.getByText("TODAY 9:15AM · CROOZN STANDUP")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Not prep for this meeting" }));
  expect(onSave).toHaveBeenCalledWith({ prep_for: null });
});

it("tops the card with estimate, time spent and time left, moving with the estimate", () => {
  const { rerender } = render(<TaskView task={card({ estimate_mins: 120 })} today={T} progress={{ spent: 45, est: 120 }} onSave={vi.fn()} onClose={() => {}} />);
  const time = screen.getByRole("group", { name: "Time" });
  expect(time).not.toHaveTextContent("ESTIMATE");
  expect(time).toHaveTextContent("SPENT45m");
  expect(time).toHaveTextContent("LEFT1h 15m");
  rerender(<TaskView task={card({ estimate_mins: 30 })} today={T} progress={{ spent: 45, est: 30 }} onSave={vi.fn()} onClose={() => {}} />);
  expect(screen.getByRole("group", { name: "Time" })).toHaveTextContent("OVER15m");
});

it("logs where the task was planned, newest first, and a line opens that day on the main screen", async () => {
  const onClose = vi.fn();
  render(<TaskView task={card()} today={T} onSave={vi.fn()} onClose={onClose} />);
  const lines = screen.getAllByRole("button", { name: /\d+[hm]/ }).filter((b) => b.className === "tk-log-line");
  expect(lines.map((l) => l.textContent)).toEqual(["TOMORROW 2PM1h", "YESTERDAY 10AM30m"]);
  await userEvent.click(lines[0]);
  expect(window.location.pathname + window.location.search).toBe("/?date=2026-10-16");
  expect(onClose).toHaveBeenCalled();
});

it("shows pictures in a carousel and other files as lines, each with its controls", async () => {
  const f = (id: string, name: string, type: string, size = 2048) => ({ id, name, type, size, created_at: 1, url: `https://files/${id}` });
  files.list = [f("a1", "front.png", "image/png"), f("a2", "invoice.pdf", "application/pdf", 3.2 * 1024 ** 2), f("a3", "back.jpg", "image/jpeg")];
  render(<TaskView task={card({ attachments: 3 })} today={T} onSave={vi.fn()} onClose={() => {}} />);
  const pics = screen.getByRole("region", { name: "Pictures" });
  expect(screen.getAllByRole("img").map((i) => i.getAttribute("alt"))).toEqual(["front.png", "back.jpg"]);
  expect(pics).toHaveTextContent("1/2");
  expect(pics).toHaveTextContent("front.png");
  await userEvent.click(screen.getByRole("button", { name: "Next picture" }));
  expect(pics).toHaveTextContent("2/2");
  expect(pics).toHaveTextContent("back.jpg");

  await userEvent.click(screen.getByRole("button", { name: "View back.jpg" })); // full screen, at that picture
  const big = screen.getByRole("dialog", { name: "Pictures, full size" });
  expect(big).toHaveTextContent("back.jpg2/2");
  await userEvent.click(within(big).getByRole("button", { name: "Next picture" }));
  expect(big).toHaveTextContent("front.png1/2");
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Pictures, full size" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "DEMO SCRIPT" })).toBeInTheDocument(); // the ticket stays open
  expect(pics).toHaveTextContent("1/2"); // at the picture last seen

  const doc = screen.getByRole("link", { name: "invoice.pdf" });
  expect(doc).toHaveAttribute("href", "https://files/a2");
  expect(doc).toHaveAttribute("target", "_blank");
  expect(doc.closest("li")).toHaveTextContent("PDF");
  expect(doc.closest("li")).toHaveTextContent("3.2 MB");

  await userEvent.click(screen.getByRole("button", { name: "Delete invoice.pdf" }));
  expect(files.calls).toEqual([]); // asks once more first
  await userEvent.click(screen.getByRole("button", { name: "Sure? Delete invoice.pdf" }));
  expect(files.calls).toEqual([["attachments:remove", { id: "a2" }]]);

  await userEvent.click(screen.getByRole("button", { name: "Rename front.png" }));
  const name = screen.getByRole("textbox", { name: "File name" });
  await userEvent.clear(name);
  await userEvent.type(name, "cover.png{Enter}");
  expect(files.calls.at(-1)).toEqual(["attachments:rename", { id: "a1", name: "cover.png" }]);
  expect(screen.getByRole("button", { name: "Download front.png" })).toBeEnabled();
});

it("leaves files off a ticket not yet filed", () => {
  render(<TaskView task={card()} today={T} onSave={vi.fn()} onCreate={vi.fn()} onClose={() => {}} />);
  expect(screen.queryByRole("region", { name: "Attachments" })).toBeNull();
  expect(screen.queryByRole("button", { name: "+ ATTACH FILES" })).toBeNull();
});

it("shows Claude's columns for a task assigned to it, and Steve's otherwise", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  const { rerender } = render(<TaskView task={card({ assignee: "claude", claude_status: "doing" })} today={T} onSave={onSave} onClose={() => {}} />);
  const col = () => within(screen.getByRole("group", { name: "Column" }));
  expect(col().getByRole("button", { name: "DOING" })).toHaveAttribute("aria-pressed", "true");
  expect(col().getByRole("button", { name: "ESCALATED" })).toBeInTheDocument();
  await userEvent.click(col().getByRole("button", { name: "ESCALATED" }));
  expect(onSave).toHaveBeenCalledWith({ claude_status: "escalated" });
  rerender(<TaskView task={card({ assignee: "steve", status: "doing" })} today={T} onSave={onSave} onClose={() => {}} />);
  expect(col().queryByRole("button", { name: "ESCALATED" })).toBeNull();
  expect(col().getByRole("button", { name: "DOING" })).toHaveAttribute("aria-pressed", "true");
});

it("shows notes as comments with replies one level deep, and files a reply under its note", async () => {
  files.notes = [
    { id: "n1", parent_id: null, author: "steve", text: "Check the demo data", created_at: 1 },
    { id: "n2", parent_id: "n1", author: "claude", text: "Done, seeded", created_at: 2 },
  ];
  render(<TaskView task={card()} today={T} onClose={() => {}} onSave={async () => true} />);
  const notes = screen.getByRole("region", { name: "Notes" });
  expect(within(notes).getByText("Check the demo data")).toBeTruthy();
  expect(within(notes).getByText("Done, seeded")).toBeTruthy();
  expect(within(notes).getAllByRole("button", { name: "Reply" })).toHaveLength(1);
  await userEvent.click(within(notes).getByRole("button", { name: "Reply" }));
  await userEvent.type(within(notes).getByRole("textbox", { name: "Reply" }), "Thanks");
  await userEvent.click(within(notes).getAllByRole("button", { name: "Reply" }).at(-1)!);
  expect(files.calls).toContainEqual(["notes:add", { task_id: "t1", text: "Thanks", parent_id: "n1" }]);
});

it("shows a note from before threads as the first comment", () => {
  render(<TaskView task={card({ note: "Old note" })} today={T} onClose={() => {}} onSave={async () => true} />);
  expect(within(screen.getByRole("region", { name: "Notes" })).getByText("Old note")).toBeTruthy();
});

it("Plan it opens a day and half-hour picker, and Plan places a block there", async () => {
  const onPlan = vi.fn();
  render(<TaskView task={card()} today={T} onSave={vi.fn()} onPlan={onPlan} onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "Plan it" }));
  const d = screen.getByRole("dialog", { name: "Plan it", hidden: true });
  await userEvent.selectOptions(within(d).getByLabelText("Time"), "630");
  await userEvent.click(within(d).getByRole("button", { name: "Plan" }));
  expect(files.calls).toContainEqual(["agent:placeBlock", { task_id: "t1", date: T, start: "10:30", mins: 30 }]);
  expect(onPlan).not.toHaveBeenCalled();
});
