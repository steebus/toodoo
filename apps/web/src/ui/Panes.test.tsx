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
  return <div className="pass"><Panes split={s}><Divider /></Panes></div>;
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
  fireEvent.keyDown(sep, { key: "End" });
  expect(loadSplit()).toBe(75);
  fireEvent.keyDown(sep, { key: "Home" });
  expect(loadSplit()).toBe(25);
});

// jsdom has no pointer capture: stand one in, as the browser would.
function capturing(sep: HTMLElement) {
  let held = false;
  sep.setPointerCapture = () => { held = true; };
  sep.hasPointerCapture = () => held;
  sep.releasePointerCapture = () => { held = false; fireEvent.lostPointerCapture(sep); };
}
const frame = (sep: HTMLElement) => {
  sep.closest(".pass")!.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
};

it("drags with the primary button, persisting only at the end", () => {
  render(<Harness />);
  const sep = screen.getByRole("separator");
  capturing(sep);
  frame(sep);
  fireEvent.pointerDown(sep, { button: 0, pointerId: 1 });
  fireEvent.pointerMove(sep, { clientX: 500, pointerId: 1 });
  expect(sep.getAttribute("aria-valuenow")).toBe("50");
  expect(localStorage.getItem("toodoo.split")).toBeNull();
  fireEvent.pointerUp(sep, { pointerId: 1 });
  expect(loadSplit()).toBe(50);
});

it("ignores a non-primary button", () => {
  render(<Harness />);
  const sep = screen.getByRole("separator");
  capturing(sep);
  frame(sep);
  fireEvent.pointerDown(sep, { button: 2, pointerId: 1 });
  fireEvent.pointerMove(sep, { clientX: 500, pointerId: 1 });
  expect(sep.getAttribute("aria-valuenow")).toBe("34");
});
