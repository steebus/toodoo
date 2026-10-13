// Epics and task status: the vocabulary and the priority rule. Type-only imports: runs in Convex and Vite.
import type { Priority } from "./planning.ts";

export const EPIC_STATUSES = ["planned", "active", "on_hold", "done"] as const;
export type EpicStatus = (typeof EPIC_STATUSES)[number];
export const EPIC_STATUS_LABEL: Record<EpicStatus, string> = { planned: "Planned", active: "Active", on_hold: "On hold", done: "Done" };

// Where an open task sits on the Kanban board. Done is the task's own done flag, not a status.
export const TASK_STATUSES = ["todo", "doing", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "To do", doing: "Doing", blocked: "Blocked" };

export interface Epic {
  id: string;
  title: string;
  description: string | null;
  priority: Priority | null;
  status: EpicStatus;
  sort_order: number;
}

type P = Priority | "none";
// A task's own priority leads; its epic's counts for half, so a high epic lifts a plain task to medium
// and a high task stays high even in a low epic. An epic on hold sinks its tasks.
export const TASK_WEIGHT: Record<P, number> = { high: 2.5, med: 1, none: 0, low: -0.5 };
export const EPIC_WEIGHT: Record<P, number> = { high: 1.25, med: 0.5, none: 0, low: -0.25 };
export const ON_HOLD_WEIGHT = -2;
export const STATUS_WEIGHT: Record<TaskStatus, number> = { todo: 0, doing: 1, blocked: -1.5 };

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

export const epicMap = <E extends { id: string }>(epics: E[] | undefined) => new Map((epics ?? []).map((e) => [e.id, e]));

const EPIC_STATUS_RANK: Record<EpicStatus, number> = { active: 0, planned: 1, on_hold: 2, done: 3 };
const PRIORITY_RANK: Record<P, number> = { high: 0, med: 1, none: 2, low: 3 };

// The epics list: active first, then planned, on hold, done; by priority within; then manual order.
export const byEpicRank = (a: Epic, b: Epic) =>
  EPIC_STATUS_RANK[a.status] - EPIC_STATUS_RANK[b.status] ||
  PRIORITY_RANK[a.priority ?? "none"] - PRIORITY_RANK[b.priority ?? "none"] ||
  a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
