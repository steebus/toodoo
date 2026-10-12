import { byOrder, daysBetween, dayWord, toMin, type Priority } from "./planning.ts";
import type { FullTask } from "./snapshot.ts";

export type GroupBy = "status" | "due" | "priority" | "tag" | "source";
export type SortBy = "manual" | "due" | "priority" | "time" | "tag";
export interface View { group: GroupBy; sort: SortBy; tag: string } // tag: "" all, a tag, or NO_TAG
export interface Group { key: string; label: string; tasks: FullTask[] }

export const NO_TAG = "__none";
export const DEFAULT_VIEW: View = { group: "status", sort: "manual", tag: "" };

const PRIORITY_RANK: Record<Priority | "none", number> = { high: 0, med: 1, low: 2, none: 3 };
const PRIORITY_LABEL: Record<Priority | "none", string> = { high: "High", med: "Medium", low: "Low", none: "No priority" };
const rank = (p: Priority | null) => PRIORITY_RANK[p ?? "none"];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const firstTag = (t: FullTask) => [...t.tags].sort()[0] ?? null;
const nullsLast = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : cmp(a, b));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const waitingDays = (due: string, today: string) => Math.max(0, daysBetween(due, today));

export function filterTasks(tasks: FullTask[], tag: string): FullTask[] {
  if (!tag) return tasks;
  return tag === NO_TAG ? tasks.filter((t) => !t.tags.length) : tasks.filter((t) => t.tags.includes(tag));
}

// Every sort ends in manual order (sort_order, then id), so ties are stable.
export function sortTasks(tasks: FullTask[], sort: SortBy): FullTask[] {
  const by: Record<SortBy, (a: FullTask, b: FullTask) => number> = {
    manual: () => 0,
    due: (a, b) => cmp(a.due, b.due),
    priority: (a, b) => rank(a.priority) - rank(b.priority),
    time: (a, b) => nullsLast(a.time, b.time),
    tag: (a, b) => nullsLast(firstTag(a), firstTag(b)),
  };
  return [...tasks].sort((a, b) => by[sort](a, b) || byOrder(a, b));
}

// First and last HH:MM among the given times; null when none.
export function spanOf(times: (string | null | undefined)[]): { from: string; to: string } | null {
  const ts = times.filter((t): t is string => toMin(t) != null).sort((a, b) => toMin(a)! - toMin(b)!);
  return ts.length ? { from: ts[0], to: ts[ts.length - 1] } : null;
}

// Filter, sort, then group. Open tasks plus anything finished today; older history is not listed.
export function groupTasks(tasks: FullTask[], today: string, view: View): Group[] {
  const rows = sortTasks(filterTasks(tasks, view.tag), view.sort);
  const open = rows.filter((t) => !t.done);
  const doneToday = rows.filter((t) => t.done && t.done_on === today);
  if (view.group === "status") {
    // Coming up sorts by day; the sort is stable, so the chosen order holds within a day.
    const comingUp = open.filter((t) => t.due > today).sort((a, b) => cmp(a.due, b.due));
    return [
      { key: "carried", label: "Carried over", tasks: open.filter((t) => t.due < today) },
      { key: "today", label: "Today", tasks: open.filter((t) => t.due === today) },
      { key: "done", label: "Done today", tasks: doneToday },
      { key: "comingup", label: "Coming up", tasks: comingUp },
    ];
  }
  const visible = rows.filter((t) => !t.done || t.done_on === today);
  const bucket = (keyOf: (t: FullTask) => string[], label: (k: string) => string, order: (a: string, b: string) => number): Group[] => {
    const m = new Map<string, FullTask[]>();
    for (const t of visible) for (const k of keyOf(t)) m.set(k, [...(m.get(k) ?? []), t]);
    return [...m.keys()].sort(order).map((key) => ({ key, label: label(key), tasks: m.get(key)! }));
  };
  switch (view.group) {
    case "due":
      return bucket((t) => [t.due], (k) => cap(dayWord(k, today)), cmp);
    case "priority":
      return bucket((t) => [t.priority ?? "none"], (k) => PRIORITY_LABEL[k as Priority | "none"],
        (a, b) => PRIORITY_RANK[a as Priority | "none"] - PRIORITY_RANK[b as Priority | "none"]);
    case "tag":
      return bucket((t) => (t.tags.length ? t.tags : [NO_TAG]), (k) => (k === NO_TAG ? "Untagged" : k),
        (a, b) => (a === NO_TAG ? 1 : b === NO_TAG ? -1 : cmp(a, b)));
    default:
      return bucket((t) => [t.source], (k) => (k === "you" ? "You" : k), cmp);
  }
}
