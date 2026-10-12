import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Divider, Panes, clampSplit, loadSplit, saveSplit, useSplit } from "./Panes";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("clamps to 25-75", () => {
  expect(clampSplit(10)).toBe(25);
  expect(clampSplit(90)).toBe(75);
  expect(clampSplit(50)).toBe(50);
  expect(clampSplit(NaN)).toBe(33.85);
});

it("persists and reloads, falling back on junk", () => {
  saveSplit(60);
  expect(loadSplit()).toBe(60);
  localStorage.setItem("toodoo.split", "junk");
  expect(loadSplit()).toBe(33.85);
  localStorage.setItem("toodoo.split", "999");
  expect(loadSplit()).toBe(75);
});

function Harness() {
  const s = useSplit();
  return <Panes split={s}><Divider /></Panes>;
}

it("moves the divider with arrow keys, clamps and persists, resets on double-click", () => {
  render(<Harness />);
  const sep = screen.getByRole("separator");
  expect(sep.getAttribute("aria-valuemin")).toBe("25");
  expect(sep.getAttribute("aria-valuemax")).toBe("75");
  fireEvent.keyDown(sep, { key: "ArrowRight" });
  expect(loadSplit()).toBeCloseTo(35.85);
  for (let i = 0; i < 40; i++) fireEvent.keyDown(sep, { key: "ArrowLeft" });
  expect(loadSplit()).toBe(25);
  expect(sep.getAttribute("aria-valuenow")).toBe("25");
  fireEvent.doubleClick(sep);
  expect(loadSplit()).toBe(33.85);
});
