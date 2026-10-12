import { describe, expect, it } from "vitest";
import { SWIPE, swipeEnd } from "./swipe";

describe("swipeEnd", () => {
  it("bumps past the right threshold, however slow", () => {
    expect(swipeEnd(SWIPE.tick, 0)).toBe("tick");
    expect(swipeEnd(SWIPE.tick - 1, 0)).toBe("close");
  });
  it("opens the actions past the left threshold", () => {
    expect(swipeEnd(-SWIPE.open, 0)).toBe("open");
    expect(swipeEnd(-SWIPE.open + 1, 0)).toBe("close");
  });
  it("takes a fast flick from a shorter travel, but not a twitch", () => {
    expect(swipeEnd(40, SWIPE.flick)).toBe("tick");
    expect(swipeEnd(-40, -SWIPE.flick)).toBe("open");
    expect(swipeEnd(10, SWIPE.flick * 2)).toBe("close");
  });
  it("a fling against the travel closes rather than staying put", () => {
    expect(swipeEnd(-80, SWIPE.flick)).toBe("close");
    expect(swipeEnd(120, -SWIPE.flick)).toBe("close");
  });
  it("from open, dragging back past the rest closes", () => {
    expect(swipeEnd(-SWIPE.rest + SWIPE.open + 80, 0)).toBe("close");
  });
});
