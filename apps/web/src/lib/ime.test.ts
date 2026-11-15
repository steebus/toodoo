import { describe, expect, it } from "vitest";
import type { KeyboardEvent } from "react";
import { composing } from "./ime";

const ev = (isComposing: boolean, keyCode: number) => ({ nativeEvent: { isComposing }, keyCode }) as unknown as KeyboardEvent;

describe("composing", () => {
  it("is the IME's Enter while a composition is open, or when Safari reports 229", () => {
    expect(composing(ev(true, 13))).toBe(true);
    expect(composing(ev(false, 229))).toBe(true);
  });
  it("is the user's own Enter otherwise", () => {
    expect(composing(ev(false, 13))).toBe(false);
  });
});
