import { describe, expect, it } from "vitest";
import { BLOCK_LEAD, HOUR_PX, minToPx } from "../ui/plan";
import { minuteUnder } from "./dnd";
import { clampBlock, deltaMin, dragBlock, hitSlot, moveBlock, openHour, pxToMin, slotAt, snap, widenRange } from "./timeline";

it("px and minutes are inverses of the plan's one mapping", () => {
  for (const m of [0, 360, 615, 1439]) expect(pxToMin(minToPx(m, 360), 360)).toBeCloseTo(m, 6);
  expect(deltaMin(HOUR_PX)).toBeCloseTo(60, 6);
  expect(deltaMin(-HOUR_PX / 2)).toBeCloseTo(-30, 6);
});

it("snaps to the nearest 5 minutes", () => {
  expect(snap(2)).toBe(0);
  expect(snap(3)).toBe(5);
  expect(snap(622)).toBe(620);
  expect(snap(-3)).toBe(-5);
});

it("clamps like the server: start 23:58 for 2m becomes 23:55 for 5m", () => {
  expect(clampBlock(23 * 60 + 58, 2)).toEqual({ start: 1435, mins: 5 });
});

it("never lets a block run under 5m", () => {
  expect(clampBlock(600, 0)).toEqual({ start: 600, mins: 5 });
  expect(clampBlock(600, -40)).toEqual({ start: 600, mins: 5 });
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
  expect(moveBlock(611, 47)).toEqual({ start: 610, mins: 45 });
});

it("a clamped block is a fixed point of the server's clamp", () => {
  for (const [s, m] of [[-90, 30], [1430, 5], [1200, 600], [700, 13]]) {
    const a = moveBlock(s, m);
    expect(clampBlock(a.start, a.mins)).toEqual(a);
    expect(a.start).toBeGreaterThanOrEqual(0);
    expect(a.start + a.mins).toBeLessThanOrEqual(1440);
    expect(a.mins).toBeGreaterThanOrEqual(5);
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

describe("openHour", () => {
  const day = { startM: 6 * 60, endM: 21 * 60 };
  it("centres a day that fits: the comp's 9:15-3:30 day with now at 11:20 opens at 7am", () => {
    const spans = [{ s: 555, e: 585 }, { s: 600, e: 660 }, { s: 780, e: 825 }, { s: 840, e: 855 }, { s: 900, e: 930 }];
    expect(openHour({ ...day, spans, nowM: 680, viewMins: 656 })).toBe(7 * 60);
    expect(openHour({ ...day, spans, nowM: 680, viewMins: 615 })).toBe(7 * 60);
  });
  it("a long day opens at the earlier of the first block's hour and the hour before now", () => {
    const spans = [{ s: 8 * 60 + 30, e: 9 * 60 }, { s: 19 * 60, e: 20 * 60 }];
    expect(openHour({ ...day, spans, nowM: 14 * 60 + 10, viewMins: 300 })).toBe(8 * 60);
    expect(openHour({ ...day, spans: [{ s: 16 * 60, e: 20 * 60 }], nowM: 9 * 60 + 40, viewMins: 300 })).toBe(8 * 60);
  });
  it("stays on the grid", () => {
    expect(openHour({ ...day, spans: [], nowM: null, viewMins: 600 })).toBe(6 * 60);
    expect(openHour({ ...day, spans: [{ s: 6 * 60, e: 7 * 60 }], nowM: null, viewMins: 900 })).toBe(6 * 60);
  });
});

// The grid is drawn in comp px scaled by the frame's --u; pointer px divide by it back. Phone (1),
// a 1440-wide window (0.94) and the narrowest desktop window (0.57) must all land on the same minutes.
describe.each([0.57, 0.94, 1])("at scale %s", (k) => {
  const hour = HOUR_PX * k; // one hour, in screen px
  it("a drag of one screen hour moves a block an hour, snapped to 5m", () => {
    expect(dragBlock({ start: 600, mins: 60, mode: "move" }, hour, k)).toEqual({ start: 660, mins: 60 });
    expect(dragBlock({ start: 600, mins: 60, mode: "move" }, (hour * 2) / 60, k)).toEqual({ start: 600, mins: 60 });
    expect(dragBlock({ start: 600, mins: 60, mode: "move" }, (hour * 3) / 60, k)).toEqual({ start: 605, mins: 60 });
  });
  it("a move stays inside 00:00 and 24:00", () => {
    expect(dragBlock({ start: 1410, mins: 60, mode: "move" }, hour * 2, k)).toEqual({ start: 1380, mins: 60 });
    expect(dragBlock({ start: 30, mins: 60, mode: "move" }, -hour * 2, k)).toEqual({ start: 0, mins: 60 });
  });
  it("a resize keeps at least 5m and stops at midnight", () => {
    expect(dragBlock({ start: 600, mins: 30, mode: "resize" }, -hour * 2, k)).toEqual({ start: 600, mins: 5 });
    expect(dragBlock({ start: 1380, mins: 30, mode: "resize" }, hour * 3, k)).toEqual({ start: 1380, mins: 60 });
  });
  it("a pull on the top moves the start and keeps the end, at least 5m, not before midnight", () => {
    expect(dragBlock({ start: 600, mins: 30, mode: "top" }, -hour, k)).toEqual({ start: 540, mins: 90 });
    expect(dragBlock({ start: 600, mins: 30, mode: "top" }, hour, k)).toEqual({ start: 625, mins: 5 });
    expect(dragBlock({ start: 30, mins: 30, mode: "top" }, -hour, k)).toEqual({ start: 0, mins: 60 });
  });
  it("a click picks the slot under it, within the day", () => {
    const at = (m: number, startM: number) => (minToPx(m, startM) - BLOCK_LEAD + 1) * k;
    expect(slotAt(at(14 * 60 + 30, 360), k, 360)).toBe(14 * 60 + 30);
    expect(slotAt(at(14 * 60 + 40, 360), k, 360)).toBe(14 * 60 + 30);
    expect(slotAt(-500 * k, k, 0)).toBe(0);
    expect(slotAt(1e5 * k, k, 0)).toBe(24 * 60 - 15);
  });
  it("a docket dropped on the line lands on the snapped minute under the pointer", () => {
    const grid = { gridTop: () => 100, startM: 360, endM: 1260, scale: () => k };
    const drop = (m: number) => ({ activatorEvent: { clientY: 100 + minToPx(m, 360) * k }, delta: { x: 0, y: 0 } });
    expect(minuteUnder(drop(17 * 60), grid)).toBe(17 * 60);
    expect(minuteUnder(drop(17 * 60 + 8), grid)).toBe(17 * 60 + 10);
    expect(minuteUnder(drop(17 * 60 + 7), grid)).toBe(17 * 60 + 5);
  });
});
