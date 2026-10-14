import { describe, expect, it } from "vitest";
import { DayInput, InputError, normLink, normPriority, parseTags, preparePatch, prepareTasks, TaskPatch } from "./validation.ts";

describe("normalisers", () => {
  it("normalises sloppy priorities", () => {
    expect(normPriority("Medium")).toBe("med");
    expect(normPriority("High priority")).toBe("high");
    expect(normPriority("urgent")).toBeNull();
    expect(normPriority(undefined)).toBeNull();
  });
  it("parses tags from strings and arrays", () => {
    expect(parseTags("#Work, urgent  work")).toEqual(["work", "urgent"]);
    expect(parseTags(["Deep Work", "#x"])).toEqual(["deep-work", "x"]);
    expect(parseTags(undefined)).toEqual([]);
  });
  it("adds https to bare links and rejects non-web links", () => {
    expect(normLink("example.atlassian.net/browse/ACME-1")).toBe("https://example.atlassian.net/browse/ACME-1");
    expect(normLink("")).toBeNull();
    expect(normLink("javascript:alert(1)")).toBeUndefined();
  });
});

describe("TaskPatch", () => {
  it("rejects unknown priorities but clears on null", () => {
    expect(TaskPatch.safeParse({ priority: "urgent" }).success).toBe(false);
    expect(TaskPatch.parse({ priority: "Medium" }).priority).toBe("med");
    expect(TaskPatch.parse({ priority: null }).priority).toBeNull();
    expect(TaskPatch.parse({ priority: "" }).priority).toBeNull();
  });
  it("zero-pads event times", () => {
    expect(DayInput.parse({ date: "2026-10-12", events: [{ title: "x", start: "9:30", end: "10:00" }] }).events![0].start).toBe("09:30");
  });
  it("only carries the fields that were sent", () => {
    const r = TaskPatch.parse({ done: true });
    expect(Object.entries(r).filter(([, v]) => v !== undefined)).toEqual([["done", true]]);
  });
});

describe("prepareTasks", () => {
  it("normalises, leaves due unset by default and reports per-item errors", () => {
    const r = prepareTasks([
      { title: "Reply to Sam", priority: "Medium", tags: "#Work", estimate_mins: "1h 30m", link: "mail.google.com/mail/u/0/#inbox/abc" },
      { title: "Bad", link: "javascript:alert(1)" },
      { title: "" },
    ], "2026-10-12");
    expect(r.rows).toEqual([{
      index: 0, epic_id: null, title: "Reply to Sam", description: null, note: null, link: "https://mail.google.com/mail/u/0/#inbox/abc",
      source: "you", external_id: null, due: null, time: null, priority: "med", estimate_mins: 90, tags: ["work"],
    }]);
    expect(r.errors.map((e) => e.index)).toEqual([1, 2]);
  });
  it("skips duplicates within a batch", () => {
    const r = prepareTasks([
      { title: "A", source: "jira", external_id: "jira:X-1" },
      { title: "B", source: "jira", external_id: "jira:X-2" },
      { title: "B again", source: "jira", external_id: "jira:X-2" },
    ], "2026-10-12");
    expect(r.rows.map((x) => x.title)).toEqual(["A", "B"]);
    expect(r.skipped.map((s) => s.title)).toEqual(["B again"]);
  });
  it("rejects impossible dates/times per item without losing valid ones", () => {
    const r = prepareTasks([
      { title: "bad", due: "2026-02-31" },
      { title: "ok" },
      { title: "bad", time: "24:00" },
    ], "2026-10-12");
    expect(r.errors.map((e) => e.index)).toEqual([0, 2]);
    expect(r.rows.map((x) => x.title)).toEqual(["ok"]);
  });
});

describe("preparePatch", () => {
  it("stamps done_on when ticking and clears it when unticking", () => {
    expect(preparePatch({ done: true }, "2026-10-12")).toEqual({ done: true, done_on: "2026-10-12" });
    expect(preparePatch({ done: false }, "2026-10-12")).toEqual({ done: false, done_on: null });
  });
  it("rejects empty patches and invalid fields", () => {
    expect(() => preparePatch({}, "2026-10-12")).toThrow("nothing to update");
    expect(() => preparePatch({ due: "2026-02-31" }, "2026-10-12")).toThrow(InputError);
  });
});

describe("DayInput validation", () => {
  it("rejects an event with start 99:99 and accepts 9:30", () => {
    expect(DayInput.safeParse({ date: "2026-10-12", events: [{ title: "x", start: "99:99" }] }).success).toBe(false);
    expect(DayInput.safeParse({ date: "2026-10-12", events: [{ title: "x", start: "9:30" }] }).success).toBe(true);
  });
  it("rejects impossible dates", () => {
    expect(DayInput.safeParse({ date: "2026-13-45" }).success).toBe(false);
  });
});
