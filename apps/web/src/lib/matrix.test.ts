import { expect, it } from "vitest";
import { bandY, dueAt, jitter, MIN_R, priorityAt, radius, urgencyX } from "./matrix";

const T = "2026-10-14";

it("puts the next two days left of the middle and later ones right, overdue and far off at the edges", () => {
  expect(urgencyX(T, T)).toBeLessThan(0.5);
  expect(urgencyX("2026-10-16", T)).toBeLessThan(0.5);
  expect(urgencyX("2026-10-17", T)).toBeGreaterThan(0.5);
  expect(urgencyX("2026-09-01", T)).toBe(0.03);
  expect(urgencyX("2027-01-01", T)).toBe(0.97);
  expect(urgencyX("2026-10-13", T)).toBeLessThan(urgencyX(T, T));
});

it("reads a due date back from where a dot is dropped", () => {
  for (const d of ["2026-10-10", T, "2026-10-15", "2026-10-21", "2026-11-01"]) expect(dueAt(urgencyX(d, T), T)).toBe(d);
});

it("puts high and med above the middle, none and low below, and reads them back", () => {
  expect(bandY("high")).toBeLessThan(bandY("med"));
  expect(bandY("med")).toBeLessThan(0.5);
  expect(bandY(null)).toBeGreaterThan(0.5);
  expect(bandY("low")).toBeGreaterThan(bandY(null));
  for (const p of ["high", "med", null, "low"] as const) expect(priorityAt(bandY(p))).toBe(p);
  expect(priorityAt(-1)).toBe("high");
  expect(priorityAt(2)).toBe("low");
});

it("sizes a dot by what's left of its estimate, never below the least", () => {
  expect(radius(null)).toBe(MIN_R);
  expect(radius(30, 30)).toBe(MIN_R);
  expect(radius(30, 60)).toBe(MIN_R);
  expect(radius(120, 60)).toBe(radius(60));
  expect(radius(120)).toBeGreaterThan(radius(60));
  expect(radius(10_000)).toBe(34);
});

it("nudges each task the same way every time, within its band", () => {
  expect(jitter("abc")).toEqual(jitter("abc"));
  const [x, y] = jitter("k57f2");
  expect(Math.abs(x)).toBeLessThanOrEqual(0.015);
  expect(Math.abs(y)).toBeLessThanOrEqual(0.085);
});
