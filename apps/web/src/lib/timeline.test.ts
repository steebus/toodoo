import { expect, it } from "vitest";
import { BLOCK_LEAD, HOUR_PX, minToPx } from "../ui/plan";
import { clampBlock, deltaMin, hitSlot, moveBlock, pxToMin, snap, widenRange } from "./timeline";

it("px and minutes are inverses of the plan's one mapping", () => {
  for (const m of [0, 360, 615, 1439]) expect(pxToMin(minToPx(m, 360), 360)).toBeCloseTo(m, 6);
  expect(deltaMin(HOUR_PX)).toBeCloseTo(60, 6);
  expect(deltaMin(-HOUR_PX / 2)).toBeCloseTo(-30, 6);
});

it("snaps to the nearest 15 minutes", () => {
  expect(snap(7)).toBe(0);
  expect(snap(8)).toBe(15);
  expect(snap(622)).toBe(615);
  expect(snap(-8)).toBe(-15);
});

it("clamps like the server: start 23:50 for 5m becomes 23:45 for 15m", () => {
  expect(clampBlock(23 * 60 + 50, 5)).toEqual({ start: 1425, mins: 15 });
});

it("never lets a block run under 15m", () => {
  expect(clampBlock(600, 0)).toEqual({ start: 600, mins: 15 });
  expect(clampBlock(600, -40)).toEqual({ start: 600, mins: 15 });
});

it("resizing past 24:00 stops at midnight", () => {
  expect(clampBlock(23 * 60, 120)).toEqual({ start: 1380, mins: 60 });
  expect(clampBlock(0, 5000)).toEqual({ start: 0, mins: 1440 });
});

it("moving above 00:00 stops at midnight and keeps the length", () => {
  expect(moveBlock(-50, 60)).toEqual({ start: 0, mins: 60 });
});

it("moving past 24:00 keeps the length and ends at midnight", () => {
  expect(moveBlock(23 * 60 + 40, 60)).toEqual({ start: 1380, mins: 60 });
  expect(moveBlock(611, 47)).toEqual({ start: 615, mins: 45 });
});

it("a clamped block is a fixed point of the server's clamp", () => {
  for (const [s, m] of [[-90, 30], [1430, 5], [1200, 600], [700, 13]]) {
    const a = moveBlock(s, m);
    expect(clampBlock(a.start, a.mins)).toEqual(a);
    expect(a.start).toBeGreaterThanOrEqual(0);
    expect(a.start + a.mins).toBeLessThanOrEqual(1440);
    expect(a.mins).toBeGreaterThanOrEqual(15);
  }
});

it("hit-tests a y position to the 15-minute slot a block there would start in", () => {
  // Blocks sit BLOCK_LEAD above their line, so a click at a block's top edge is its own start.
  expect(hitSlot(minToPx(600, 360) - BLOCK_LEAD, 360)).toBe(600);
  expect(hitSlot(minToPx(610, 360) - BLOCK_LEAD, 360)).toBe(600);
  expect(hitSlot(minToPx(616, 360) - BLOCK_LEAD, 360)).toBe(615);
  expect(hitSlot(-500, 360)).toBe(0);
  expect(hitSlot(99999, 360)).toBe(1425);
});

it("widens an hour range to whole hours around new spans, never past the day", () => {
  expect(widenRange(360, 1320, [{ s: 600, e: 660 }])).toEqual({ startM: 360, endM: 1320 });
  expect(widenRange(360, 1320, [{ s: 290, e: 1350 }])).toEqual({ startM: 240, endM: 1380 });
  expect(widenRange(360, 1320, [{ s: 0, e: 1440 }])).toEqual({ startM: 0, endM: 1440 });
});
