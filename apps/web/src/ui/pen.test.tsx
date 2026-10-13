import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { fitOf } from "./build";
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
