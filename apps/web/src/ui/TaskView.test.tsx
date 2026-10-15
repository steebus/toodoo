import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";

vi.mock("convex/react", () => ({
  useQuery: () => [
    { date: "2026-10-15", start: "09:15", end: "09:45", title: "Croozn standup", where: null },
    { date: "2026-10-16", start: "14:00", end: "15:00", title: "Client demo", where: "Zoom" },
  ],
}));

import { TaskView } from "./TaskView";

afterEach(cleanup);
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
