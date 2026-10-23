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

describe("calendar date validation", () => {
  it("does not consume an impossible day/month slash date", () => {
    expect(p("x 31/2")).toMatchObject({ title: "x 31/2", due: null });
    expect(p("x 31/2").chips.some((c) => c.kind === "date")).toBe(false);
  });
  it("does not consume an impossible day-month word date", () => {
    expect(p("x 40 oct")).toMatchObject({ title: "x 40 oct", due: null });
  });
});

describe("date roll-forward", () => {
  it("moves a day+month that has passed this year to next year", () => {
    expect(p("x 30 sep").due).toBe("2027-09-30");
    expect(p("x 3/10").due).toBe("2027-10-03");
  });
  it("keeps future dates and today in this year", () => {
    expect(p("x 20 oct").due).toBe("2026-10-20");
    expect(p("x 12 oct").due).toBe("2026-10-12");
  });
  it("treats a weekday that is today as next week", () => {
    expect(parseQuickAdd("x fri", "2026-10-16", 540).due).toBe("2026-10-23");
  });
});

describe("strict month words", () => {
  it("does not read ordinary words starting with a month as months", () => {
    expect(p("Buy 2 marbles")).toMatchObject({ title: "Buy 2 marbles", due: null });
    expect(p("Order 5 decks")).toMatchObject({ title: "Order 5 decks", due: null });
  });
  it("accepts full month names and sept", () => {
    expect(p("x 20 september").due).toBe("2027-09-20");
    expect(p("x 20 sept").due).toBe("2027-09-20");
  });
});

describe("time range checks", () => {
  it("rejects out-of-range am/pm hours and minutes", () => {
    expect(p("x 13pm")).toMatchObject({ title: "x 13pm", time: null });
    expect(p("x 9:75am")).toMatchObject({ title: "x 9:75am", time: null });
  });
  it("rejects an out-of-range 'at' hour", () => {
    expect(p("x at 25")).toMatchObject({ title: "x at 25", time: null });
  });
  it("reads 12pm as noon and 12am as midnight", () => {
    expect(p("x 12pm").time).toBe("12:00");
    expect(p("x 12am").time).toBe("00:00");
  });
  it("reads 'at 7' as 07:00", () => {
    expect(p("x at 7").time).toBe("07:00");
  });
});

describe("lead-in words", () => {
  it("absorbs 'at' before a time into the time chip", () => {
    const r = p("Call Sam at 3pm");
    expect(r).toMatchObject({ title: "Call Sam", time: "15:00" });
    expect(r.chips).toContainEqual({ kind: "time", text: "at 3pm" });
  });
  it("absorbs 'on' before a date into the date chip", () => {
    const r = p("Pay rent on friday");
    expect(r).toMatchObject({ title: "Pay rent", due: "2026-10-16" });
    expect(r.chips).toContainEqual({ kind: "date", text: "on friday" });
  });
});

describe("pinned behaviour", () => {
  it("keeps '~0m' in the title because zero is not an estimate", () => {
    expect(p("x ~0m")).toMatchObject({ title: "x ~0m", estimate_mins: null });
  });
  it("produces one tag for duplicate tags", () => {
    const r = p("x #work #work");
    expect(r.tags).toEqual(["work"]);
    expect(r.chips.filter((c) => c.kind === "tag")).toHaveLength(1);
  });
});

describe("+epic", () => {
  const epics = [
    { id: "w", title: "Website relaunch", status: "active" },
    { id: "t", title: "Tax time", status: "planned" },
    { id: "d", title: "Taxidermy", status: "done" },
  ];
  it("files a task under the epic its title, or a word of it, starts with", () => {
    expect(parseQuickAdd("Fix footer +web", "2026-10-12", 0, epics)).toMatchObject({ title: "Fix footer", epic_id: "w" });
    expect(parseQuickAdd("Fix footer +relaunch", "2026-10-12", 0, epics).epic_id).toBe("w");
    expect(parseQuickAdd("Receipts +tax", "2026-10-12", 0, epics).chips).toContainEqual({ kind: "epic", text: "Tax time" });
  });
  it("leaves a word that matches no open epic in the title", () => {
    expect(parseQuickAdd("C +taxid", "2026-10-12", 0, epics)).toMatchObject({ title: "C +taxid", epic_id: null });
    expect(parseQuickAdd("1 +1 = 2", "2026-10-12", 0, epics)).toMatchObject({ title: "1 +1 = 2", epic_id: null });
  });
});

describe("parseQuickAdd description and checklist", () => {
  it("takes text in quotes as the description", () => {
    expect(p('Call Sam "about the quote and invoice" tomorrow')).toMatchObject({
      title: "Call Sam", description: "about the quote and invoice", due: "2026-10-13",
    });
    expect(p("Call Sam").description).toBeNull();
    expect(p('Say "hi').title).toBe('Say "hi');
  });
  it("turns each dash word into a checklist item running to the next dash", () => {
    const r = p("Pack bag -passport and visa -charger -socks");
    expect(r.title).toBe("Pack bag");
    expect(r.checklist).toEqual([
      { text: "passport and visa", done: false }, { text: "charger", done: false }, { text: "socks", done: false },
    ]);
  });
  it("leaves a spaced dash and negative numbers in the title", () => {
    expect(p("Plan - draft 3 -5 degrees").checklist).toEqual([]);
  });
  it("lets a quoted dash stay in the description", () => {
    expect(p('Fix "use -f flag" -test it')).toMatchObject({ description: "use -f flag", checklist: [{ text: "test it", done: false }] });
  });
});
