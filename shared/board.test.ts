import { describe, expect, it } from "vitest";
import { filterTasks, groupTasks, sortTasks, spanOf, waitingDays, type View } from "./board.ts";
import type { FullTask } from "./snapshot.ts";

const T = "2026-03-10";
let n = 0;
const task = (o: Partial<FullTask> & { title: string }): FullTask => ({
  id: `t${++n}`, due: T, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: n,
  source: "you", external_id: null, tags: [], link: null, note: null, description: null, ...o,
});
const view = (o: Partial<View> = {}): View => ({ group: "status", sort: "manual", tag: "", ...o });
const titles = (ts: { title: string }[]) => ts.map((t) => t.title);

describe("groupTasks by status", () => {
  const tasks = [
    task({ title: "Overdue A", due: "2026-03-07" }),
    task({ title: "Overdue B", due: "2026-03-09" }),
    task({ title: "Today A" }),
    task({ title: "Done now", done: true, done_on: T }),
    task({ title: "Done earlier", done: true, done_on: "2026-03-08" }),
    task({ title: "Later B", due: "2026-03-14" }),
    task({ title: "Later A", due: "2026-03-12" }),
  ];
  const groups = groupTasks(tasks, T, view());

  it("makes the four groups in order", () => {
    expect(groups.map((g) => g.key)).toEqual(["carried", "today", "done", "comingup"]);
    expect(groups.map((g) => g.label)).toEqual(["Carried over", "Today", "Done today", "Coming up"]);
  });
  it("splits by due date and done state, dropping older history", () => {
    expect(titles(groups[0].tasks)).toEqual(["Overdue A", "Overdue B"]);
    expect(titles(groups[1].tasks)).toEqual(["Today A"]);
    expect(titles(groups[2].tasks)).toEqual(["Done now"]);
    expect(groups.flatMap((g) => titles(g.tasks))).not.toContain("Done earlier");
  });
  it("sorts coming up by due date", () => {
    expect(titles(groups[3].tasks)).toEqual(["Later A", "Later B"]);
  });
  it("keeps empty groups so counts stay honest", () => {
    expect(groupTasks([], T, view()).map((g) => g.tasks.length)).toEqual([0, 0, 0, 0]);
  });
});

describe("groupTasks by other keys", () => {
  const tasks = [
    task({ title: "a", due: "2026-03-12", priority: "low", tags: ["home"], source: "jira" }),
    task({ title: "b", due: "2026-03-08", priority: "high", tags: ["work", "home"], source: "you" }),
    task({ title: "c", due: "2026-03-12", tags: [], source: "gmail" }),
    task({ title: "d", done: true, done_on: T, priority: "med", tags: ["work"] }),
    task({ title: "old", done: true, done_on: "2026-03-01" }),
  ];
  it("groups by due date ascending and drops old history", () => {
    const g = groupTasks(tasks, T, view({ group: "due" }));
    expect(g.map((x) => x.key)).toEqual(["2026-03-08", "2026-03-10", "2026-03-12"]);
    expect(titles(g[2].tasks)).toEqual(["a", "c"]);
  });
  it("groups by priority high to none", () => {
    const g = groupTasks(tasks, T, view({ group: "priority" }));
    expect(g.map((x) => x.key)).toEqual(["high", "med", "low", "none"]);
    expect(titles(g[3].tasks)).toEqual(["c"]);
  });
  it("groups by tag, a task in each of its tags, untagged last", () => {
    const g = groupTasks(tasks, T, view({ group: "tag" }));
    expect(g.map((x) => x.key)).toEqual(["home", "work", "__none"]);
    expect(titles(g[0].tasks)).toEqual(["a", "b"]);
    expect(titles(g[1].tasks)).toEqual(["b", "d"]);
    expect(titles(g[2].tasks)).toEqual(["c"]);
  });
  it("groups by source", () => {
    const g = groupTasks(tasks, T, view({ group: "source" }));
    expect(g.map((x) => x.key)).toEqual(["gmail", "jira", "you"]);
    expect(titles(g[2].tasks)).toEqual(["b", "d"]);
  });
  it("omits empty groups outside status", () => {
    expect(groupTasks([], T, view({ group: "priority" }))).toEqual([]);
  });
});

describe("sortTasks", () => {
  const a = task({ title: "a", sort_order: 5, due: "2026-03-12", priority: "low", time: "14:00", tags: ["zed"] });
  const b = task({ title: "b", sort_order: 3, due: "2026-03-11", priority: "high", time: null, tags: [] });
  const c = task({ title: "c", sort_order: 3, due: "2026-03-11", priority: "high", time: "09:00", tags: ["alpha", "zed"] });
  const d = task({ title: "d", sort_order: 1, due: "2026-03-13", priority: null, time: "09:00", tags: ["beta"] });
  const all = [a, b, c, d];
  const order = (s: Parameters<typeof sortTasks>[1]) => titles(sortTasks(all, s));
  it("manual: sort_order then id", () => {
    expect(order("manual")).toEqual(["d", "b", "c", "a"]);
    // b and c share sort_order 3: the lower id wins
    expect(b.id < c.id).toBe(true);
  });
  it("due: ties fall back to manual", () => expect(order("due")).toEqual(["b", "c", "a", "d"]));
  it("priority: high, med, low, none then manual", () => expect(order("priority")).toEqual(["b", "c", "a", "d"]));
  it("time: untimed last, ties manual", () => expect(order("time")).toEqual(["d", "c", "a", "b"]));
  it("tag: first tag alphabetical, untagged last", () => expect(order("tag")).toEqual(["c", "d", "a", "b"]));
  it("does not mutate its input", () => {
    const copy = [...all];
    sortTasks(all, "due");
    expect(all).toEqual(copy);
  });
});

describe("filterTasks", () => {
  const tasks = [task({ title: "a", tags: ["work"] }), task({ title: "b", tags: [] }), task({ title: "c", tags: ["home", "work"] })];
  it("all", () => expect(titles(filterTasks(tasks, ""))).toEqual(["a", "b", "c"]));
  it("a tag", () => expect(titles(filterTasks(tasks, "work"))).toEqual(["a", "c"]));
  it("untagged", () => expect(titles(filterTasks(tasks, "__none"))).toEqual(["b"]));
  it("is applied by groupTasks", () => {
    const g = groupTasks(tasks, T, view({ tag: "home" }));
    expect(g.find((x) => x.key === "today")!.tasks.map((t) => t.title)).toEqual(["c"]);
  });
});

describe("spanOf and waitingDays", () => {
  it("empty is null", () => expect(spanOf([])).toBeNull());
  it("ignores blanks", () => expect(spanOf([null, undefined, ""])).toBeNull());
  it("single time is both ends", () => expect(spanOf(["09:30"])).toEqual({ from: "09:30", to: "09:30" }));
  it("first and last, order-independent", () =>
    expect(spanOf(["13:00", null, "09:15", "15:30"])).toEqual({ from: "09:15", to: "15:30" }));
  it("counts days waiting", () => expect(waitingDays("2026-03-04", T)).toBe(6));
});
