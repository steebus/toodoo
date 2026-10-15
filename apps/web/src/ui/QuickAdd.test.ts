import { describe, expect, it } from "vitest";
import { setWord } from "./QuickAdd";

describe("setWord", () => {
  it("swaps the word of its kind and leaves the rest", () => {
    expect(setWord("buy milk !low ~15m", /^!/, "!high")).toBe("buy milk ~15m !high ");
  });
  it("takes the word out for none", () => {
    expect(setWord("buy milk !low", /^!/, null)).toBe("buy milk");
  });
});
