import { describe, expect, it } from "vitest";
import { buildSnapshot, type FullTask } from "./snapshot.ts";

const T = "2026-10-12";
const t = (id: string, p: Partial<FullTask> = {}): FullTask => ({
  id, title: id, due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 0,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, ...p,
});

describe("buildSnapshot", () => {
  const tasks = [
    t("carried", { due: "2026-10-10", source: "jira", external_id: "jira:X-1", tags: ["work"] }),
    t("today"),
    t("later", { due: "2026-10-20" }),
    t("done", { done: true, done_on: T }),
    t("oldDone", { done: true, done_on: "2026-10-01" }),
  ];
  const days = [{ date: T, headline: "Clear arvo", events: [] }, { date: "2026-10-13", headline: null, events: [] }];
  const blocks = [{ task_id: "today", date: T, start: "09:00", mins: 30 }];

  it("buckets tasks and compacts them", () => {
    const s = buildSnapshot({ date: T, today: T, nowM: 480, tasks, days, blocks });
    expect(s.tasks.carried).toEqual([{ id: "carried", title: "carried", due: "2026-10-10", tags: ["work"], source: "jira", external_id: "jira:X-1" }]);
    expect(s.tasks.due.map((x) => x.id)).toEqual(["today"]);
    expect(s.tasks.upcoming.map((x) => x.id)).toEqual(["later"]);
    expect(s.tasks.done).toEqual([{ id: "done", title: "done" }]);
    expect(s.day?.headline).toBe("Clear arvo");
    expect(s.next_day?.date).toBe("2026-10-13");
    expect(s.plan).toEqual([{ task_id: "today", title: "today", start: "09:00", mins: 30 }]);
    expect(s.planned_mins).toBe(30);
    expect(s.suggestions.map((x) => x.id)).toEqual(["carried"]);
  });
  it("adds the next few days' events as the week, skipping empty days", () => {
    const ev = { start: "10:00", end: "10:30", title: "Dentist" };
    const s = buildSnapshot({ date: T, today: T, nowM: 480, tasks, blocks,
      days: [...days, { date: "2026-10-14", headline: null, events: [] }, { date: "2026-10-15", headline: null, events: [ev] }, { date: "2026-10-17", headline: null, events: [ev] }] });
    expect(s.week).toEqual([{ date: "2026-10-15", events: [ev] }]);
  });
  it("filters by text or #tag", () => {
    const s = buildSnapshot({ date: T, today: T, nowM: 480, tasks, days, blocks, query: "#work" });
    expect(s.tasks.carried).toHaveLength(1);
    expect(s.tasks.due).toHaveLength(0);
  });
  it("keeps buckets disjoint when viewing a past date", () => {
    const past = [
      t("carried8", { due: "2026-10-08" }),
      t("upcoming12", { due: "2026-10-12" }),
      t("carried1", { due: "2026-10-01" }),
    ];
    const s = buildSnapshot({ date: "2026-10-05", today: T, nowM: 480, tasks: past, days: [], blocks: [] });
    expect(s.tasks.carried.map((x) => x.id)).toEqual(["carried1", "carried8"]);
    expect(s.tasks.upcoming.map((x) => x.id)).toEqual(["upcoming12"]);
    expect(s.tasks.due).toEqual([]);
  });
  it("#tag matches tags exactly, plain text matches substrings", () => {
    const net = [t("net", { title: "Fix network", tags: ["ops"] })];
    const tagged = buildSnapshot({ date: T, today: T, nowM: 480, tasks: net, days: [], blocks: [], query: "#work" });
    expect(tagged.tasks.due).toHaveLength(0);
    const plain = buildSnapshot({ date: T, today: T, nowM: 480, tasks: net, days: [], blocks: [], query: "network" });
    expect(plain.tasks.due.map((x) => x.id)).toEqual(["net"]);
  });
});
