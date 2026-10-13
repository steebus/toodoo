import { toMin } from "@shared/planning.ts";
import type { BoardData } from "../ui/types";

export type FocusBlock = { id: string; startM: number; endM: number; state: "now" | "next" };

// The task Focus is about: the open task whose block on today's line covers now, else the next one to start
// today. Null away from today, or with nothing (open) left on the line.
export function focusBlock(b: BoardData, nowM = b.nowM): FocusBlock | null {
  if (b.date !== b.today) return null;
  const open = new Set(b.tasks.filter((t) => !t.done).map((t) => t.id));
  const blocks = b.blocks
    .filter((x) => x.date === b.today && open.has(x.task_id))
    .map((x) => ({ id: x.task_id, startM: toMin(x.start) ?? 0, endM: (toMin(x.start) ?? 0) + x.mins }))
    .sort((a, c) => a.startM - c.startM);
  const now = blocks.find((x) => x.startM <= nowM && nowM < x.endM);
  if (now) return { ...now, state: "now" };
  const next = blocks.find((x) => x.startM > nowM);
  return next ? { ...next, state: "next" } : null;
}
