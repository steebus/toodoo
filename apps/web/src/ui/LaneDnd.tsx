import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, MouseSensor, pointerWithin, TouchSensor, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useState, type ReactNode } from "react";
import { dropOf, type Drop, type Lane } from "../lib/lanes";

// A drop ends with a click on whatever is under the pointer: slips ignore clicks this soon after one.
export const lastDrop = { at: 0 };
export const justDropped = () => Date.now() - lastDrop.at < 300;

// Under the pointer, a task beats the lane it sits in; with no pointer (the keyboard), the nearest.
const collide: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length) {
    const task = hits.find((h) => args.droppableContainers.find((c) => c.id === h.id)?.data.current?.type === "task");
    return [task ?? hits[0]];
  }
  return closestCenter(args);
};

type Props = {
  lanes: Lane[];
  titleOf: (id: string) => string;
  laneName: (lane: string) => string;
  onDrop: (id: string, to: Drop) => void;
  ghost: (id: string) => ReactNode;
  disabled?: boolean;
  children: ReactNode;
};

// One drag-and-drop world for a set of lanes (Board columns, or epics).
export function LaneDnd({ lanes, titleOf, laneName, onDrop, ghost, disabled, children }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );
  const where = (id: string | number | undefined) => {
    if (id === undefined) return "";
    const lane = lanes.find((l) => l.id === id || l.ids.includes(String(id)));
    return lane ? laneName(lane.id) : "";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(String(active.id))}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(String(active.id))} is over ${where(over.id)}.` : `${titleOf(String(active.id))} is not over a lane.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${titleOf(String(active.id))} in ${where(over.id)}.` : `${titleOf(String(active.id))} was put back.`),
    onDragCancel: ({ active }) => `Cancelled. ${titleOf(String(active.id))} was put back.`,
  };
  if (disabled) return <>{children}</>;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collide}
      accessibility={{ announcements }}
      onDragStart={(e) => setActive(String(e.active.id))}
      onDragCancel={() => setActive(null)}
      onDragEnd={(e) => {
        setActive(null);
        lastDrop.at = Date.now();
        const to = dropOf(lanes, String(e.active.id), e.over ? String(e.over.id) : null);
        if (to) onDrop(String(e.active.id), to);
      }}
    >
      {children}
      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>{active ? ghost(active) : null}</DragOverlay>
    </DndContext>
  );
}

// A lane's list: sortable within, and a drop target even when empty.
export function LaneList({ id, ids, className, label, children }: { id: string; ids: string[]; className?: string; label: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: "lane" } });
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <ul ref={setNodeRef} className={`${className ?? ""}${isOver ? " is-over" : ""}`} aria-label={label}>
        {children}
      </ul>
    </SortableContext>
  );
}
