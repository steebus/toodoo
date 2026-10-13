import { describe, expect, it } from "vitest";
import { dropOf, laneStep, orderAt, type Lane } from "./lanes";

const lanes: Lane[] = [
  { id: "todo", ids: ["a", "b", "c"] },
  { id: "doing", ids: ["d", "e"] },
  { id: "done", ids: [] },
];

describe("dropOf", () => {
  it("reorders within a lane, taking the place of the one it is over", () => {
    expect(dropOf(lanes, "a", "c")).toEqual({ lane: "todo", index: 2 });
    expect(dropOf(lanes, "c", "a")).toEqual({ lane: "todo", index: 0 });
  });
  it("is no move when dropped on itself or nowhere", () => {
    expect(dropOf(lanes, "b", "b")).toBeNull();
    expect(dropOf(lanes, "b", null)).toBeNull();
    expect(dropOf(lanes, "b", "zzz")).toBeNull();
  });
  it("goes before the task it is over in another lane", () => {
    expect(dropOf(lanes, "a", "e")).toEqual({ lane: "doing", index: 1 });
  });
  it("goes to the end when dropped on a lane itself, empty or not", () => {
    expect(dropOf(lanes, "a", "done")).toEqual({ lane: "done", index: 0 });
    expect(dropOf(lanes, "a", "doing")).toEqual({ lane: "doing", index: 2 });
    expect(dropOf(lanes, "a", "todo")).toEqual({ lane: "todo", index: 2 });
  });
});

it("orders between neighbours, or past the ends", () => {
  expect(orderAt([1, 2, 3], 1)).toBe(1.5);
  expect(orderAt([1, 2, 3], 0)).toBe(0);
  expect(orderAt([1, 2, 3], 3)).toBe(4);
});

it("steps to the next or previous lane", () => {
  expect(laneStep(lanes, "a", 1)).toBe("doing");
  expect(laneStep(lanes, "d", -1)).toBe("todo");
  expect(laneStep(lanes, "a", -1)).toBeNull();
  expect(laneStep(lanes, "nope", 1)).toBeNull();
});
