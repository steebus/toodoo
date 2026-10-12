import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Hero } from "./Hero";
import type { HeroData } from "./types";

afterEach(cleanup);

const rows = [{ label: "START", value: "09:00" }, { label: "COUNT", value: "1 of 1" }];
const data: HeroData = {
  date: "Tuesday 3 March",
  headline: "Team standup, then focus time.",
  done: 1,
  total: 4,
  presets: ["Capture", "Plan", "Focus"],
  activePreset: "Plan",
  hours: ["9am", "10am"],
  now: "9:30",
  blocks: [{ id: "event-standup", kind: "event", time: "9:00", title: "Team standup" }],
  span: { from: "9:00", to: "5:00" },
  quickAdd: "Write report ~1h",
  chips: { when: "today", priority: "normal", duration: "~ 1h" },
  nextUp: [{ title: "Write report", when: "Starts in 10m", why: "Due today" }],
  carried: [{ tag: "CARRIED OVER", title: "FILE EXPENSES", rows, footer: { label: "DURATION", value: "~5m" } }],
  today: [{ time: "9:00", duration: "~1h", title: ["WRITE", "REPORT"], topPick: true, rows }],
  comingUp: 0,
};

it("renders the day, the plan and the rails from its data", () => {
  render(<Hero data={data} />);
  expect(screen.getByRole("heading", { level: 1, name: "Tuesday 3 March" })).toBeInTheDocument();
  expect(screen.getByText("1 of 4 done")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("list", { name: "Plan" })).getByText("Team standup")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "WRITE REPORT" })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "FILE EXPENSES" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "New to do" })).toHaveValue("Write report ~1h");
});
