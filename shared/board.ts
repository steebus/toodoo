import { byEpicRank, effectivePriority, epicMap, plusHigh, TASK_STATUS_LABEL, TASK_STATUSES, type Epic } from "./epics.ts";
import { addDays, byOrder, daysBetween, toMin, type Priority } from "./planning.ts";

// Coming up is this many days ahead; Later is past it.
export const LATER_AFTER = 7;
import type { FullTask } from "./snapshot.ts";

// "status" is the rails by when (shown as Due: Carried over, Today, Coming up...); "column" is the Kanban status.
export type GroupBy = "status" | "column" | "priority" | "tag" | "source" | "epic";
export type SortBy = "manual" | "due" | "priority" | "time" | "tag" | "effort";
// tag: "" all, a tag, or NO_TAG; epic: "" (or missing) all, an epic's id, or NO_EPIC
export interface View { group: GroupBy; sort: SortBy; tag: string; epic?: string }
export interface Group { key: string; label: string; tasks: FullTask[] }

export const NO_TAG = "__none";
export const NO_EPIC = "__none";
export const DEFAULT_VIEW: View = { group: "status", sort: "manual", tag: "" };

const PRIORITY_RANK: Record<Priority | "none", number> = { high: 0, med: 1, low: 2, none: 3 };
const PRIORITY_LABEL: Record<Priority | "none", string> = { high: "High", med: "Medium", low: "Low", none: "No priority" };
const rank = (p: Priority | null) => PRIORITY_RANK[p ?? "none"];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const firstTag = (t: FullTask) => [...t.tags].sort()[0] ?? null;
const nullsLast = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : cmp(a, b));

export const waitingDays = (due: string, today: string) => Math.max(0, daysBetween(due, today));

export function filterTasks(tasks: FullTask[], tag: string, epic = ""): FullTask[] {
  const byEpic = !epic ? tasks : tasks.filter((t) => (epic === NO_EPIC ? !t.epic_id : t.epic_id === epic));
  if (!tag) return byEpic;
  return tag === NO_TAG ? byEpic.filter((t) => !t.tags.length) : byEpic.filter((t) => t.tags.includes(tag));
}

// Every sort ends in manual order (sort_order, then id), so ties are stable.
// Priority is the task's own as its epic lifts or sinks it.
export function sortTasks(tasks: FullTask[], sort: SortBy, epics?: Epic[]): FullTask[] {
  const em = epicMap(epics);
  const epicOf = (t: FullTask) => (t.epic_id ? em.get(t.epic_id) : null);
  const eff = (t: FullTask) => rank(effectivePriority(t, epicOf(t))) - (plusHigh(t, epicOf(t)) ? 0.5 : 0); // +high ahead of high
  const by: Record<SortBy, (a: FullTask, b: FullTask) => number> = {
    manual: () => 0,
    due: (a, b) => cmp(a.due, b.due),
    priority: (a, b) => eff(a) - eff(b),
    time: (a, b) => nullsLast(a.time, b.time),
    tag: (a, b) => nullsLast(firstTag(a), firstTag(b)),
    effort: (a, b) => (b.estimate_mins ?? -1) - (a.estimate_mins ?? -1), // the biggest first, the unsized last
  };
  return [...tasks].sort((a, b) => by[sort](a, b) || byOrder(a, b));
}

// First and last HH:MM among the given times; null when none.
export function spanOf(times: (string | null | undefined)[]): { from: string; to: string } | null {
  const ts = times.filter((t): t is string => toMin(t) != null).sort((a, b) => toMin(a)! - toMin(b)!);
  return ts.length ? { from: ts[0], to: ts[ts.length - 1] } : null;
}

// Filter, sort, then group. Open tasks plus anything finished today; older history is not listed.
export function groupTasks(tasks: FullTask[], today: string, view: View, epics?: Epic[]): Group[] {
  const rows = sortTasks(filterTasks(tasks, view.tag, view.epic), view.sort, epics);
  const open = rows.filter((t) => !t.done);
  const doneToday = rows.filter((t) => t.done && t.done_on === today);
  if (view.group === "status") {
    // Coming up is the week ahead, Later everything after; both by day (the sort is stable, so the chosen order
    // holds within a day).
    const week = addDays(today, LATER_AFTER);
    const ahead = open.filter((t) => t.due > today).sort((a, b) => cmp(a.due, b.due));
    return [
      { key: "carried", label: "Carried over", tasks: open.filter((t) => t.due < today) },
      { key: "today", label: "Today", tasks: open.filter((t) => t.due === today) },
      { key: "done", label: "Done today", tasks: doneToday },
      { key: "comingup", label: "Coming up", tasks: ahead.filter((t) => t.due <= week) },
      { key: "later", label: "Later", tasks: ahead.filter((t) => t.due > week) },
    ];
  }
  const visible = rows.filter((t) => !t.done || t.done_on === today);
  const bucket = (keyOf: (t: FullTask) => string[], label: (k: string) => string, order: (a: string, b: string) => number): Group[] => {
    const m = new Map<string, FullTask[]>();
    for (const t of visible) for (const k of keyOf(t)) m.set(k, [...(m.get(k) ?? []), t]);
    return [...m.keys()].sort(order).map((key) => ({ key, label: label(key), tasks: m.get(key)! }));
  };
  switch (view.group) {
    case "column": {
      const order: string[] = [...TASK_STATUSES, "done"];
      return bucket((t) => [t.done ? "done" : t.status ?? "todo"],
        (k) => (k === "done" ? "Done today" : TASK_STATUS_LABEL[k as keyof typeof TASK_STATUS_LABEL]), (a, b) => order.indexOf(a) - order.indexOf(b));
    }
    case "priority":
      return bucket((t) => [t.priority ?? "none"], (k) => PRIORITY_LABEL[k as Priority | "none"],
        (a, b) => PRIORITY_RANK[a as Priority | "none"] - PRIORITY_RANK[b as Priority | "none"]);
    case "epic": {
      const em = epicMap(epics);
      const order = [...(epics ?? [])].sort(byEpicRank).map((e) => e.id);
      const at = (k: string) => (k === NO_EPIC || !em.has(k) ? order.length : order.indexOf(k));
      return bucket((t) => [t.epic_id ?? NO_EPIC], (k) => em.get(k)?.title ?? "No epic", (a, b) => at(a) - at(b) || cmp(a, b));
    }
    case "tag":
      return bucket((t) => (t.tags.length ? t.tags : [NO_TAG]), (k) => (k === NO_TAG ? "Untagged" : k),
        (a, b) => (a === NO_TAG ? 1 : b === NO_TAG ? -1 : cmp(a, b)));
    default:
      return bucket((t) => [t.source], (k) => (k === "you" ? "You" : k), cmp);
  }
}
