import { describe, expect, it } from "vitest";
import { derivedKey, mapBlocks, mapDays, mapTasks } from "./artifact-map.ts";

describe("artifact mapping", () => {
  it("derives Jira and Gmail keys from links", () => {
    expect(derivedKey({ title: "x", due: "2026-10-01", source: "jira", link: "https://example.atlassian.net/browse/ACME-293" })).toBe("jira:ACME-293");
    expect(derivedKey({ title: "x", due: "2026-10-01", source: "email", link: "https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWqhzLkd" })).toBe("gmail:FMfcgzQXJWqhzLkd");
    expect(derivedKey({ title: "x", due: "2026-10-01", source: "you" })).toBeNull();
  });
  it("derives the Gmail API hex thread id from the decimal thread-f link", () => {
    expect(derivedKey({ title: "x", due: "2026-10-01", source: "email", link: "https://mail.google.com/mail/?authuser=x@y.com#all/thread-f:1844674407370955161" })).toBe("gmail:1999999999999999");
  });
  it("maps fields and gives the newest duplicate the derived key", () => {
    const link = "https://example.atlassian.net/browse/ACME-1";
    const rows = mapTasks([
      { id: "2026-09-23-acme-1", data: { title: "Old", due: "2026-09-23", source: "jira", link, done: true, doneOn: "2026-09-24", created: "2026-09-23T00:00:00Z" } },
      { id: "2026-10-01-acme-1", data: { title: "New", due: "2026-10-01", source: "jira", link, created: "2026-10-01T00:00:00Z", priority: "medium", estimate: 45, order: 12.5 } },
      { id: "mine", data: { title: "Mine", due: "2026-10-01", tag: "Home", created: "2026-10-01T01:00:00Z" } },
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.artifactId, r.row]));
    expect(by["2026-10-01-acme-1"]).toMatchObject({ external_id: "jira:ACME-1", priority: "med", estimate_mins: 45, sort_order: 12.5, tags: ["work"] });
    expect(by["2026-09-23-acme-1"]).toMatchObject({ external_id: "artifact:2026-09-23-acme-1", done: true, done_on: "2026-09-24" });
    expect(by.mine).toMatchObject({ source: "you", external_id: "artifact:mine", tags: ["home"], sort_order: Date.parse("2026-10-01T01:00:00Z") / 1000 });
    expect(Object.keys(by.mine).sort()).toEqual(Object.keys(by["2026-10-01-acme-1"]).sort());
  });
  it("maps blocks, dropping missing tasks, bad times and duplicates", () => {
    const keyOf = new Map([["a", { source: "jira", external_id: "jira:A-1" }]]);
    const { blocks, dropped } = mapBlocks([{ id: "2026-10-01", data: { blocks: [
      { taskId: "a", start: "09:00", mins: 10 }, { taskId: "a", start: "10:00", mins: 30 },
      { taskId: "gone", start: "11:00", mins: 30 }, { taskId: "a", start: "bad", mins: 30 },
    ] } }], keyOf);
    expect(blocks).toEqual([{ date: "2026-10-01", source: "jira", external_id: "jira:A-1", start: "09:00", mins: 15 }]);
    expect(dropped).toEqual([
      { date: "2026-10-01", taskId: "a", reason: "duplicate" },
      { date: "2026-10-01", taskId: "gone", reason: "missing task" },
      { date: "2026-10-01", taskId: "a", reason: "bad time" },
    ]);
  });
  it("maps days", () => {
    expect(mapDays([{ id: "2026-10-01", data: { headline: "Hi" } }])).toEqual([{ date: "2026-10-01", headline: "Hi", events: [] }]);
  });
});
