import { sortOrderBetween } from "./sortOrder";

// Lanes are Kanban columns or epics: each holds task ids in the order shown.
export type Lane = { id: string; ids: string[] };
export type Drop = { lane: string; index: number }; // index in the lane once the dragged task has left it

const laneOf = (lanes: Lane[], id: string) => lanes.find((l) => l.id === id || l.ids.includes(id));

// Where a task dropped on `over` (a task or a lane) lands. In its own lane it takes the place of the one it is
// over, as the sortable list shows; in another lane it goes in before the one it is over, or at the end.
export function dropOf(lanes: Lane[], active: string, over: string | null): Drop | null {
  if (!over) return null;
  const from = laneOf(lanes, active);
  const to = laneOf(lanes, over);
  if (!from || !to) return null;
  const rest = to.ids.filter((id) => id !== active);
  if (over === to.id) return { lane: to.id, index: rest.length };
  if (from.id === to.id) {
    const at = to.ids.indexOf(over);
    return at === to.ids.indexOf(active) ? null : { lane: to.id, index: at };
  }
  return { lane: to.id, index: rest.indexOf(over) };
}

// The sort_order that puts a task at `index` among the others (ordered as shown).
export function orderAt(orders: number[], index: number): number {
  return sortOrderBetween(orders[index - 1], orders[index]);
}

// The lane after (dir 1) or before (dir -1) a task's own: for the [ and ] keys.
export function laneStep(lanes: Lane[], id: string, dir: 1 | -1): string | null {
  const at = lanes.findIndex((l) => l.ids.includes(id));
  return at < 0 ? null : lanes[at + dir]?.id ?? null;
}
