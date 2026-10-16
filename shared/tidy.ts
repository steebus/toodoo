import { nullsLast } from "./board.ts";
import { addDays, byOrder } from "./planning.ts";
import type { FullTask } from "./snapshot.ts";

// A task gone this long without an edit or a place in a day's plan has gone quiet.
export const QUIET_DAYS = 21;
// Parked (backlog or blocked) is quiet on purpose, for a while: after this long it is worth another look.
export const PARKED_DAYS = 28;
export const isParked = (t: Pick<FullTask, "status">) => t.status === "backlog" || t.status === "blocked";

export type TidyTask = FullTask & { touched_on: string };
export type Pile = "quiet" | "undated" | "unsized" | "jira";
export const PILES: Pile[] = ["quiet", "undated", "unsized", "jira"];

// The open tasks that need a look, in piles. Parked tasks (backlog, blocked) go quiet later, and the backlog is
// never undated (it has no day on purpose); a date still to come is a plan, not quiet. Oldest (or soonest) first.
// jira: the external ids Jira listed as open at the last sync (null: unknown). A Jira task done here that Jira still
// lists, or open here that it no longer lists, is out of sync; Steve fixes it in Jira and the next sync clears it.
export function piles(tasks: TidyTask[], blocks: { task_id: string; date: string }[], today: string, jira: string[] | null = null): Record<Pile, TidyTask[]> {
  const listed = jira && new Set(jira);
  const since = addDays(today, -QUIET_DAYS);
  const parkedSince = addDays(today, -PARKED_DAYS);
  const planned = new Set(blocks.filter((b) => b.date >= since).map((b) => b.task_id));
  const open = tasks.filter((t) => !t.done);
  return {
    quiet: open.filter((t) => t.touched_on < (isParked(t) ? parkedSince : since) && !planned.has(t.id) && (t.due === null || t.due < today))
      .sort((a, b) => a.touched_on.localeCompare(b.touched_on) || byOrder(a, b)),
    undated: open.filter((t) => t.status !== "backlog" && t.due === null).sort(byOrder),
    unsized: open.filter((t) => !t.estimate_mins)
      .sort((a, b) => nullsLast(a.due, b.due) || byOrder(a, b)),
    jira: !listed ? [] : tasks.filter((t) => t.source === "jira" && t.external_id !== null && t.done === listed.has(t.external_id)).sort(byOrder),
  };
}

// How many tasks are in any pile (one in two piles counts once). Jira out-of-sync is Steve's to fix in Jira: not on the badge.
export const tidyCount = (p: Record<Pile, TidyTask[]>) => new Set(PILES.filter((k) => k !== "jira").flatMap((k) => p[k].map((t) => t.id))).size;
