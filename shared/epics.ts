// Epics and task status: the vocabulary and the priority rule. Type-only imports: runs in Convex and Vite.
import type { Priority } from "./planning.ts";

export const EPIC_STATUSES = ["planned", "active", "on_hold", "done"] as const;
export type EpicStatus = (typeof EPIC_STATUSES)[number];
export const EPIC_STATUS_LABEL: Record<EpicStatus, string> = { planned: "Planned", active: "Active", on_hold: "On hold", done: "Done" };

// Where an open task sits on the Kanban board. Done is the task's own done flag, not a status.
export const TASK_STATUSES = ["backlog", "todo", "doing", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { backlog: "Backlog", todo: "To do", doing: "Doing", blocked: "Blocked" };

// Categorical, never signals: no reds or greens (those mean high/carried and done). Hues live in tokens.css.
export const EPIC_COLOURS = [
  "blue", "violet", "amber", "teal", "plum", "slate", "ochre", "sky", "indigo", "cyan", "gold", "coffee", "orchid", "denim", "copper", "lilac",
  "navy", "mauve", "peach", "sand", "steel", "mustard", "fuchsia", "periwinkle", "pewter", "tangerine", "heather", "umber",
] as const;
export type EpicColour = (typeof EPIC_COLOURS)[number];

export interface Epic {
  id: string;
  title: string;
  description: string | null;
  priority: Priority | null;
  status: EpicStatus;
  sort_order: number;
  colour?: EpicColour | null; // missing on epics made before colours
  repo?: string | null; // the repository its work lands in (owner/name or a URL)
}

// A new epic takes the first colour no open epic is using, then goes round again.
export function nextColour(epics: Pick<Epic, "colour" | "status">[]): EpicColour {
  const used = new Set(epics.filter((e) => e.status !== "done").map((e) => e.colour));
  return EPIC_COLOURS.find((c) => !used.has(c)) ?? EPIC_COLOURS[epics.length % EPIC_COLOURS.length];
}

// The words that pick an epic: its title's, lower case, short and common ones left out.
const STOP = new Set(["the", "and", "for", "with", "from", "into", "our", "new", "your", "this", "that"]);
export const epicWords = (s: string) =>
  s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w));

type P = Priority | "none";
// A task's own priority leads; its epic's counts for half, so a high epic lifts a plain task to medium
// and a high task stays high even in a low epic. An epic on hold sinks its tasks.
export const TASK_WEIGHT: Record<P, number> = { high: 2.5, med: 1, none: 0, low: -0.5 };
export const EPIC_WEIGHT: Record<P, number> = { high: 1.25, med: 0.5, none: 0, low: -0.25 };
export const ON_HOLD_WEIGHT = -2;
export const STATUS_WEIGHT: Record<TaskStatus, number> = { backlog: -1, todo: 0, doing: 1, blocked: -1.5 };

type Pick2 = Pick<Epic, "priority" | "status"> | null | undefined;

export const epicWeight = (epic: Pick2) =>
  epic ? EPIC_WEIGHT[epic.priority ?? "none"] + (epic.status === "on_hold" ? ON_HOLD_WEIGHT : 0) : 0;

export const priorityScore = (task: { priority: Priority | null }, epic?: Pick2) =>
  TASK_WEIGHT[task.priority ?? "none"] + epicWeight(epic);

// The score read back as a level, for sorting, grouping and the "!" on a card.
export function effectivePriority(task: { priority: Priority | null }, epic?: Pick2): Priority | null {
  const s = priorityScore(task, epic);
  return s >= 2 ? "high" : s >= 0.75 ? "med" : s <= -0.5 ? "low" : null;
}

// High twice over: a high task in a high epic (not on hold). Printed "+HIGH", and first among the highs.
export const plusHigh = (task: { priority: Priority | null }, epic?: Pick2) =>
  task.priority === "high" && epic?.priority === "high" && epic.status !== "on_hold";

export const epicMap = <E extends { id: string }>(epics: E[] | undefined) => new Map((epics ?? []).map((e) => [e.id, e]));

const EPIC_STATUS_RANK: Record<EpicStatus, number> = { active: 0, planned: 1, on_hold: 2, done: 3 };
const PRIORITY_RANK: Record<P, number> = { high: 0, med: 1, none: 2, low: 3 };

// The epics list: active first, then planned, on hold, done; by priority within; then manual order.
export const byEpicRank = (a: Epic, b: Epic) =>
  EPIC_STATUS_RANK[a.status] - EPIC_STATUS_RANK[b.status] ||
  PRIORITY_RANK[a.priority ?? "none"] - PRIORITY_RANK[b.priority ?? "none"] ||
  a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
