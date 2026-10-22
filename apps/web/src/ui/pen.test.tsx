import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { FullTask } from "@shared/snapshot.ts";
import { docket, fitOf } from "./build";
import { Docket } from "./Docket";
import { PenProgress } from "./icons";

afterEach(cleanup);

it("squeezes long titles harder", () => {
  expect(fitOf("Buy timber")).toBe(0);
  expect(fitOf("CROOZ-279 Port daily game/player into expo")).toBe(1);
  expect(fitOf("RSVP to P&C school hours consultation (Thu 22 Oct, needs a reply)")).toBe(2);
});

it("inks the progress line as far as the time spent, and red past the estimate", () => {
  const { container, rerender } = render(<PenProgress spent={45} est={90} />);
  expect(screen.getByRole("img", { name: "45m of 90m" })).toBeInTheDocument();
  expect(container.querySelector(".pen-progress-ink")!.getAttribute("stroke-dashoffset")).toBe("0.5");
  rerender(<PenProgress spent={120} est={90} />);
  expect(container.querySelector(".pen-progress")!.classList.contains("is-over")).toBe(true);
  expect(container.querySelector(".pen-progress-ink")!.getAttribute("stroke-dashoffset")).toBe("0");
});

it("hooks a paperclip on a docket whose task has files, and none on one without", () => {
  const t: FullTask = {
    id: "t1", title: "Receipts", due: null, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 1,
    source: "you", external_id: null, tags: [], link: null, note: null, description: null,
  };
  const { rerender } = render(<ol><Docket docket={docket({ ...t, attachments: 2 }, null, "2026-10-12")} /></ol>);
  expect(screen.getByRole("img", { name: "2 attachments" })).toHaveClass("dk-clip");
  rerender(<ol><Docket docket={docket(t, null, "2026-10-12")} /></ol>);
  expect(screen.queryByRole("img", { name: /attachment/ })).toBeNull();
});
