import { afterEach, expect, it, vi } from "vitest";
import { sortOrderBetween } from "./sortOrder";

afterEach(() => vi.useRealTimers());

it("takes the midpoint between two neighbours", () => {
  expect(sortOrderBetween(2, 4)).toBe(3);
  expect(sortOrderBetween(1, 2)).toBe(1.5);
});
it("goes one past a lone neighbour", () => {
  expect(sortOrderBetween(5, undefined)).toBe(6);
  expect(sortOrderBetween(undefined, 5)).toBe(4);
});
it("falls back to the clock when there are no neighbours", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(5_000_000));
  expect(sortOrderBetween()).toBe(5000);
});
