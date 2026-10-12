// What a finished drag means, kept free of React and dnd-kit so it can be tested directly.
import { defaultBlockMins, type Priority } from "@shared/planning.ts";
import { clampBlock, pxToMin, snap } from "./timeline";
import { sortOrderBetween } from "./sortOrder";

export const TIMELINE = "timeline";

export type DragTask = { sort_order: number; priority: Priority | null; estimate_mins: number | null };
export type DropEnv = {
  groups: { id: string; ids: string[] }[];
  manual: boolean;
  tasks: Map<string, DragTask>;
  planned: (id: string) => number; // minutes of this task already on the line
};
// The slice of dnd-kit's DragEndEvent used here. The timeline droppable carries where its grid is.
export type TimelineData = { gridTop: () => number; startM: number; endM: number };
export type DragEndLike = {
  active: { id: string | number };
  over: { id: string | number; data: { current?: Partial<TimelineData> } } | null;
  activatorEvent: Event | { clientY?: number; touches?: { clientY: number }[] };
  delta: { x: number; y: number };
};
export type DropResult =
  | { kind: "reorder"; id: string; sortOrder: number }
  | { kind: "plan"; id: string; start: number; mins: number };

// Where the pointer is now: where the drag began plus how far it has moved. A keyboard drag has none.
export function pointerY(e: Pick<DragEndLike, "activatorEvent" | "delta">): number | null {
  const a = e.activatorEvent as { clientY?: number; touches?: { clientY: number }[]; changedTouches?: { clientY: number }[] };
  const y0 = a.clientY ?? a.touches?.[0]?.clientY ?? a.changedTouches?.[0]?.clientY;
  return typeof y0 === "number" ? y0 + e.delta.y : null;
}

// The 15m minute under the pointer on the timeline, or null when it cannot be told.
export function minuteUnder(e: Pick<DragEndLike, "activatorEvent" | "delta">, grid: Partial<TimelineData> | undefined): number | null {
  const y = pointerY(e);
  if (y === null || !grid?.gridTop || grid.startM === undefined) return null;
  return snap(pxToMin(y - grid.gridTop(), grid.startM));
}

export function resolveDragEnd(e: DragEndLike, env: DropEnv): DropResult | null {
  if (!e.over) return null;
  const id = String(e.active.id);
  if (e.over.id === TIMELINE) {
    const task = env.tasks.get(id);
    const m = minuteUnder(e, e.over.data.current);
    if (!task || m === null) return null;
    const p = clampBlock(m, defaultBlockMins(task, env.planned(id)));
    return { kind: "plan", id, ...p };
  }
  if (!env.manual) return null;
  const overId = String(e.over.id);
  const group = env.groups.find((g) => g.ids.includes(id));
  if (!group || id === overId || !group.ids.includes(overId)) return null;
  // The same move dnd-kit's arrayMove makes: the docket takes the target's place.
  const ids = [...group.ids];
  const k = group.ids.indexOf(overId);
  ids.splice(group.ids.indexOf(id), 1);
  ids.splice(k, 0, id);
  const order = (i: number) => (i >= 0 && i < ids.length ? env.tasks.get(ids[i])?.sort_order : undefined);
  return { kind: "reorder", id, sortOrder: sortOrderBetween(order(k - 1), order(k + 1)) };
}
