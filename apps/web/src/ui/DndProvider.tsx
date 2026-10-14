import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, MouseSensor, pointerWithin, TouchSensor, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultBlockMins, effortMap } from "@shared/planning.ts";
import { addDays } from "@shared/planning.ts";
import { minuteUnder, RAIL, resolveDragEnd, TIMELINE, type DropEnv, type Movable, type TimelineData } from "../lib/dnd";
import { keepOnScreen } from "../lib/keepOnScreen";
import { clampBlock } from "../lib/timeline";
import type { Actions } from "../lib/useActions";
import { DocketGhost, keyDrag } from "./Docket";
import { Flight, type FlightPlan } from "./Flight";
import { FreezeLayout, reducedMotion as reduced, useLingering } from "./motion";
import type { BoardData, GroupData } from "./types";

// Where a docket held over the line would land, so the Timeline can draw its drop indicator.
export type DropHint = { start: number; mins: number } | null;
const HintContext = createContext<DropHint>(null);
export const useDropHint = () => useContext(HintContext);


// Under the pointer: the line first, then a docket, then a rail (another rail moves the task there, and a
// folded rail has nothing else to land on). Otherwise the nearest docket. A keyboard drag has no pointer,
// so it never sees the line or the rails: it only reorders.
const isRail = (id: string | number) => String(id).startsWith(RAIL);
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const pick = hits.find((c) => c.id === TIMELINE) ?? hits.find((c) => !isRail(c.id)) ?? hits.find((c) => isRail(c.id));
  if (pick) return [pick];
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== TIMELINE && !isRail(c.id)) });
};

type Props = {
  board: BoardData; groups: GroupData[]; manual: boolean; compact?: boolean; actions?: Actions; children: ReactNode;
  moves?: boolean; // the rails are the status groups: dropping on another rail moves the task there
};

// One drag-and-drop world around the whole Hero. Without actions (the fixture) there is nothing to write, so no drag.
export function DndProvider({ actions, ...props }: Props) {
  return actions ? <Live {...props} actions={actions} /> : <>{props.children}</>;
}

function Live({ board, groups, manual, compact, actions, children, moves }: Props & { actions: Actions }) {
  const [active, setActive] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [morph, setMorph] = useState<FlightPlan | null>(null);
  const frozen = useLingering(active !== null);
  const [toLine, setToLine] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a click still opens the sheet
    // A stationary long press lifts a docket; a finger that moves first is scrolling, or swiping it (Swipe.tsx).
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Enter stays the docket's own: it opens the sheet. Only Space picks up and drops.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const dockets = useMemo(() => new Map(groups.flatMap((g) => g.dockets).map((d) => [d.id, d])), [groups]);
  const env = useMemo<DropEnv>(() => {
    const eff = effortMap(board.blocks, board.today, board.nowM);
    return {
      groups: groups.map((g) => ({ id: g.key, ids: g.dockets.map((d) => d.id) })),
      manual,
      moves,
      tasks: new Map(board.tasks.map((t) => [t.id, t])),
      planned: (id) => eff.get(id)?.planned ?? 0,
    };
  }, [board, groups, manual, moves]);
  const envRef = useRef(env);
  envRef.current = env;

  const titleOf = (id: string | number) => dockets.get(String(id))?.title.toLowerCase() ?? "docket";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== TIMELINE ? `${titleOf(active.id)} is over ${titleOf(over.id)}.` : `${titleOf(active.id)} is not over a row.`,
    onDragEnd: ({ active, over }) =>
      over ? (over.id === TIMELINE ? `Dropped ${titleOf(active.id)}. Press p to plan it.` : `Dropped ${titleOf(active.id)}.`) : `${titleOf(active.id)} was put back.`,
    onDragCancel: ({ active }) => `Cancelled. ${titleOf(active.id)} was put back.`,
  };

  const byKey = useRef(false);
  const stamp = () => {
    if (byKey.current) keyDrag.at = Date.now();
  };
  const onStart = (e: DragStartEvent) => {
    byKey.current = "key" in e.activatorEvent;
    stamp();
    setActive(String(e.active.id));
    setToLine(false);
  };
  const onMove = useCallback((e: DragMoveEvent) => {
    const id = String(e.active.id);
    const m = e.over?.id === TIMELINE ? minuteUnder(e, e.over.data.current as Partial<TimelineData>) : null;
    const task = envRef.current.tasks.get(id);
    if (m === null || !task) return setHint((h) => (h ? null : h));
    const p = clampBlock(m, defaultBlockMins(task, envRef.current.planned(id)));
    setHint((h) => (h && h.start === p.start && h.mins === p.mins ? h : p));
  }, []);
  const onEnd = (e: DragEndEvent) => {
    stamp();
    setActive(null);
    setHint(null);
    const r = resolveDragEnd(e, envRef.current);
    if (r?.kind === "reorder") actions.reorder(r.id, r.sortOrder);
    if (r?.kind === "move") moveTo(r.id, r.to, r.sortOrder);
    if (r?.kind === "plan") {
      const d = dockets.get(r.id);
      const from = e.active.rect.current.translated;
      if (d && from && !reduced()) {
        setToLine(true);
        setMorph({ docket: d, compact, at: new DOMRect(from.left, from.top, from.width, from.height), target: `[data-task="${CSS.escape(d.id)}"]:last-of-type` });
      }
      actions.place(r.id, board.date, r.start, r.mins);
    }
  };
  // Into Done today ticks it; into Today makes it today's (and reopens it); into Coming up puts it off to
  // tomorrow (a later day stays as it is).
  const moveTo = (id: string, to: Movable, sortOrder?: number) => {
    const t = board.tasks.find((x) => x.id === id);
    if (!t) return;
    const order = sortOrder !== undefined ? { sort_order: sortOrder } : {};
    if (to === "done") return actions.tick(id, true);
    const reopen = t.done ? { done: false } : {};
    if (to === "today") return actions.shift(id, { ...reopen, due: board.today, ...order }, `Today: ${t.title}`);
    const later = t.due && t.due > board.today ? t.due : addDays(board.today, 1);
    actions.shift(id, { ...reopen, due: later, ...order }, `Coming up: ${t.title}`);
  };
  const onCancel = () => {
    stamp();
    setActive(null);
    setHint(null);
  };

  const dragged = active ? dockets.get(active) : undefined;
  return (
    <DndContext
      sensors={actions.offline ? [] : sensors}
      collisionDetection={collide}
      autoScroll={false} // the pointer maths assumes nothing scrolls under the hand
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Press space to pick up. Use the arrow keys to move within the row. Press space to drop, or escape to cancel. Press p on a docket to plan it.",
        },
      }}
      onDragStart={onStart}
      onDragMove={onMove}
      onDragEnd={onEnd}
      onDragCancel={onCancel}
    >
      <FreezeLayout.Provider value={frozen}>
        <HintContext.Provider value={hint}>{children}</HintContext.Provider>
      </FreezeLayout.Provider>
      <DragOverlay modifiers={[keepOnScreen]} dropAnimation={toLine || reduced() ? null : undefined}>
        {dragged && <DocketGhost docket={dragged} compact={compact} />}
      </DragOverlay>
      {morph && <Flight key={morph.docket.id} plan={morph} onDone={() => setMorph((m) => (m === morph ? null : m))} />}
    </DndContext>
  );
}
