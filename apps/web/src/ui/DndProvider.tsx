import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, MouseSensor, pointerWithin, TouchSensor, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { defaultBlockMins, effortMap } from "@shared/planning.ts";
import { minuteUnder, resolveDragEnd, TIMELINE, type DropEnv, type TimelineData } from "../lib/dnd";
import { clampBlock } from "../lib/timeline";
import type { Actions } from "../lib/useActions";
import { DocketGhost, keyDrag } from "./Docket";
import type { BoardData, DocketData, GroupData } from "./types";

// Where a docket held over the line would land, so the Timeline can draw its drop indicator.
export type DropHint = { start: number; mins: number } | null;
const HintContext = createContext<DropHint>(null);
export const useDropHint = () => useContext(HintContext);

const MORPH_MS = 320;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The pointer wins over the line when it is on it; otherwise the nearest docket in the rails.
// A keyboard drag has no pointer, so it never sees the line: it only reorders.
const collide: CollisionDetection = (args) => {
  const onLine = pointerWithin(args).find((c) => c.id === TIMELINE);
  if (onLine) return [onLine];
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== TIMELINE) });
};

type Props = { board: BoardData; groups: GroupData[]; manual: boolean; actions?: Actions; children: ReactNode };

// One drag-and-drop world around the whole Hero. Without actions (the fixture) there is nothing to write, so no drag.
export function DndProvider({ actions, ...props }: Props) {
  return actions ? <Live {...props} actions={actions} /> : <>{props.children}</>;
}

type Morph = { docket: DocketData; from: DOMRect };

function Live({ board, groups, manual, actions, children }: Props & { actions: Actions }) {
  const [active, setActive] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [morph, setMorph] = useState<Morph | null>(null);
  const [toLine, setToLine] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a click still opens the sheet
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }), // long-press; Task 12 owns the rest
    // Enter stays the docket's own: it opens the sheet. Only Space picks up and drops.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const dockets = useMemo(() => new Map(groups.flatMap((g) => g.dockets).map((d) => [d.id, d])), [groups]);
  const env = useMemo<DropEnv>(() => {
    const eff = effortMap(board.blocks, board.today, board.nowM);
    return {
      groups: groups.map((g) => ({ id: g.key, ids: g.dockets.map((d) => d.id) })),
      manual,
      tasks: new Map(board.tasks.map((t) => [t.id, t])),
      planned: (id) => eff.get(id)?.planned ?? 0,
    };
  }, [board, groups, manual]);
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
    if (r?.kind === "plan") {
      const d = dockets.get(r.id);
      const from = e.active.rect.current.translated;
      if (d && from && !reduced()) {
        setToLine(true);
        setMorph({ docket: d, from: new DOMRect(from.left, from.top, from.width, from.height) });
      }
      actions.place(r.id, board.date, r.start, r.mins);
    }
  };
  const onCancel = () => {
    stamp();
    setActive(null);
    setHint(null);
  };

  const dragged = active ? dockets.get(active) : undefined;
  return (
    <DndContext
      sensors={sensors}
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
      <HintContext.Provider value={hint}>{children}</HintContext.Provider>
      <DragOverlay dropAnimation={toLine || reduced() ? null : undefined}>
        {dragged && <DocketGhost docket={dragged} />}
      </DragOverlay>
      {morph && <MorphToBlock key={morph.docket.id} morph={morph} onDone={() => setMorph(null)} />}
    </DndContext>
  );
}

// The shared-layout beat: a picture of the docket sits where it was dropped, then shrinks into the block's
// rectangle while fading out, as the block fades in underneath. Transform and opacity only.
function MorphToBlock({ morph, onDone }: { morph: Morph; onDone: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    let frame = 0;
    let tries = 0;
    const find = () => {
      const node = el.current;
      const block = document.querySelector<HTMLElement>(`[data-block="${CSS.escape(morph.docket.id)}"]`);
      if (!node || typeof node.animate !== "function") return done.current();
      if (!block) {
        if (++tries > 40) return done.current();
        frame = requestAnimationFrame(find);
        return;
      }
      const to = block.getBoundingClientRect();
      const { from } = morph;
      const move = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
      block.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MORPH_MS, delay: MORPH_MS / 3, fill: "backwards", easing: "ease-out" });
      node.animate([{ transform: "none", opacity: 1 }, { transform: move, opacity: 0 }], {
        duration: MORPH_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards",
      }).finished.then(() => done.current(), () => done.current());
    };
    frame = requestAnimationFrame(find);
    return () => cancelAnimationFrame(frame);
  }, [morph]);
  const { from, docket } = morph;
  return (
    <div ref={el} className="dk-morph" aria-hidden style={{ left: from.left, top: from.top, width: from.width, height: from.height }}>
      <DocketGhost docket={docket} />
    </div>
  );
}
