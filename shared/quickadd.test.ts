import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickadd.ts";

const T = "2026-10-12"; // a Monday
const p = (s: string, nowM = 9 * 60) => parseQuickAdd(s, T, nowM);

describe("parseQuickAdd", () => {
  it("parses the spec example", () => {
    expect(p("Call Sam tomorrow 3pm !high #work ~1h")).toMatchObject({
      title: "Call Sam", due: "2026-10-13", time: "15:00", priority: "high", tags: ["work"], estimate_mins: 60,
    });
  });
  it("keeps a plain title untouched", () => {
    expect(p("Buy milk")).toMatchObject({ title: "Buy milk", due: null, time: null, priority: null, tags: [], estimate_mins: null, chips: [] });
  });
  it("understands today, weekdays (next occurrence) and dates", () => {
    expect(p("x today").due).toBe("2026-10-12");
    expect(p("x fri").due).toBe("2026-10-16");
    expect(p("x mon").due).toBe("2026-10-19");
    expect(p("Plan the wedding").due).toBeNull();
    expect(p("x wednesday").due).toBe("2026-10-14");
    expect(p("x 20 oct").due).toBe("2026-10-20");
    expect(p("x 3/11").due).toBe("2026-11-03");
  });
  it("reads times, with bare hours meaning working hours", () => {
    expect(p("x 9:30am").time).toBe("09:30");
    expect(p("x 15:45").time).toBe("15:45");
    expect(p("lunch with Sam at 1").time).toBe("13:00");
    expect(p("x at 8").time).toBe("08:00");
  });
  it("reads priority shorthands and estimates", () => {
    expect(p("x !").priority).toBe("high");
    expect(p("x !med").priority).toBe("med");
    expect(p("x !low").priority).toBe("low");
    expect(p("x ~45m").estimate_mins).toBe(45);
    expect(p("x ~1h30").estimate_mins).toBe(90);
  });
  it("normalises tags and leaves stray symbols in the title", () => {
    expect(p("x #Deep-Work #c++").tags).toEqual(["deep-work", "c"]);
    expect(p("Email Q&A #work").title).toBe("Email Q&A");
  });
  it("emits chips in input order for the UI", () => {
    expect(p("Call Sam tomorrow 3pm !high").chips.map((c) => c.kind)).toEqual(["date", "time", "priority"]);
  });
});
