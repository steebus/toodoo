import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { finishedTheDay, newArrivals } from "./motion";

const day = (done: number, total: number, date = "2026-10-12") => ({ date, done, total });

it("celebrates only the tick that bumps the day's last docket", () => {
  expect(finishedTheDay(day(8, 9), day(9, 9))).toBe(true);
  expect(finishedTheDay(null, day(9, 9))).toBe(false); // first paint of a finished day
  expect(finishedTheDay(day(9, 10), day(9, 9))).toBe(false); // the last open docket was deleted
  expect(finishedTheDay(day(9, 9), day(9, 9))).toBe(false); // nothing changed
  expect(finishedTheDay(day(8, 9, "2026-10-11"), day(9, 9))).toBe(false); // a different day came in
  expect(finishedTheDay(day(0, 0), day(0, 0))).toBe(false);
  expect(finishedTheDay(day(7, 9), day(8, 9))).toBe(false);
});

it("counts dockets from elsewhere as arrivals, not this device's own adds", () => {
  const local = (id: string) => id.startsWith("optimistic-");
  expect(newArrivals(null, ["a", "b"], local)).toEqual([]); // first paint: nothing arrives
  expect(newArrivals(new Set(["a"]), ["a", "b", "c"], local)).toEqual(["b", "c"]);
  expect(newArrivals(new Set(["a"]), ["a", "optimistic-1"], local)).toEqual([]);
  // the optimistic docket was swapped for its saved self: the same docket
  expect(newArrivals(new Set(["a", "optimistic-1"]), ["a", "x"], local)).toEqual([]);
  expect(newArrivals(new Set(["a", "optimistic-1"]), ["a", "x", "y"], local)).toEqual(["y"]);
});

afterEach(() => vi.unstubAllGlobals());

it("under reduced motion the celebration is a still tick, not the printed slip", async () => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("reduce"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
  }));
  vi.resetModules(); // motion reads the preference once per module instance
  const { AllBumped } = await import("./TopBar");
  render(<AllBumped total={9} />);
  expect(screen.getByTestId("bumped-tick")).toBeInTheDocument();
  expect(screen.queryByTestId("bumped-slip")).toBeNull();
});
