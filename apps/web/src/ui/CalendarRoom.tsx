import {
  DndContext, DragOverlay, MouseSensor, pointerWithin, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { addDays, byOrder } from "@shared/planning.ts";
import { epicMap, effectivePriority, type Epic } from "@shared/epics.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { Everything } from "../lib/stats";
import type { WorkActions } from "../lib/useWork";
import { dayItems, fold, monthGrid, monthLabel, monthOf, stepMonth, type DayItem } from "../lib/month";
import { useNarrow } from "../lib/useNarrow";
import { clock12, compactDate, longDate } from "./format";
import { PlusIcon, PlanModeIcon } from "./icons";
import { PlanSheet } from "./PlanSheet";
import { DateControls, HeaderControls } from "./RoomShell";
import { epicStyle } from "./Slip";
import { TaskView } from "./TaskView";
import { Toast } from "./Toast";
import "./calendar.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TRAY = "tray";
const DAY = "day:";
const LONG_PRESS_MS = 480;

const blank = (due: string): FullTask => ({
  id: "new", title: "", due, time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 0,
  epic_id: null, status: "todo", tags: [], source: "you", external_id: null, link: null, note: null, description: null, checklist: [],
});

// What the month shows besides events, kept on this device.
type Show = { due: boolean; plans: boolean };
const SHOW_KEY = "toodoo.calendarShow";
function loadShow(): Show {
  try {
    return { due: true, plans: true, ...(JSON.parse(localStorage.getItem(SHOW_KEY) ?? "null") as Partial<Show> | null) };
  } catch {
    return { due: true, plans: true };
  }
}

type Pop = { kind: "more"; date: string; rest: DayItem[]; at: DOMRect } | { kind: "menu"; date: string; at: DOMRect };

// The month: every task on its due day, every plan block and every synced event, with the undated tasks in a tray
// beside it. Drag one from the tray (or another day) onto a day to give it that date; back on the tray takes the date
// off. A day's + makes a task on it, Plan opens the planner for it (on the phone, a long press on the day offers both).
export function CalendarRoom({ all, actions }: { all: Everything; actions: WorkActions }) {
  const narrow = useNarrow();
  const [month, setMonth] = useState(() => monthOf(all.today));
  const days = useMemo(() => monthGrid(month), [month]);
  const live = useQuery(api.calendar.month, { from: days[0], until: days[days.length - 1] });
  const events = useMemo(() => new Map((live ?? []).map((d) => [d.date, d.events])), [live]);
  const epics = useMemo(() => epicMap(all.epics), [all.epics]);
  const tags = useMemo(() => [...new Set(all.tasks.flatMap((t) => t.tags))].sort(), [all.tasks]);

  // A drop shows at once: the new date holds until the task comes back from the server with it.
  const [moved, setMoved] = useState<Record<string, string | null>>({});
  const tasks = useMemo(() => all.tasks.map((t) => (t.id in moved ? { ...t, due: moved[t.id] } : t)), [all.tasks, moved]);
  useEffect(() => {
    const settled = Object.keys(moved).filter((id) => all.tasks.find((t) => t.id === id)?.due === moved[id]);
    if (settled.length) setMoved((m) => Object.fromEntries(Object.entries(m).filter(([id]) => !settled.includes(id))));
  }, [all.tasks]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the server's tasks change
  const undated = useMemo(() => tasks.filter((t) => !t.done && !t.due).sort(byOrder), [tasks]);

  const [viewing, setViewing] = useState<string | null>(null);
  const [draft, setDraft] = useState<FullTask | null>(null);
  const [planning, setPlanning] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const [dragging, setDragging] = useState<FullTask | null>(null);
  const [show, setShowState] = useState(loadShow);
  const toggle = (k: keyof Show) => {
    const next = { ...show, [k]: !show[k] };
    setShowState(next);
    try { localStorage.setItem(SHOW_KEY, JSON.stringify(next)); } catch { /* holds for this visit */ }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );
  const onStart = (e: DragStartEvent) => {
    setPop(null);
    setDragging(tasks.find((t) => t.id === e.active.id) ?? null);
  };
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    const t = tasks.find((x) => x.id === e.active.id);
    const to = e.over ? String(e.over.id) : null;
    if (!t || !to) return;
    const due = to === TRAY ? null : to.startsWith(DAY) ? to.slice(DAY.length) : undefined;
    if (due === undefined || due === t.due) return;
    setMoved((m) => ({ ...m, [t.id]: due }));
    actions.move(t.id, due ? { due } : { due: null, time: null }, due ? `Due ${compactDate(due)}: ${t.title}` : `No date: ${t.title}`);
  };

  const room = narrow ? 3 : 4;
  const viewTask = viewing ? tasks.find((t) => t.id === viewing) : undefined;
  const open = (id: string) => { setPop(null); setViewing(id); };
  const add = (date: string) => { setPop(null); setDraft(blank(date)); };
  const plan = (date: string) => { setPop(null); setPlanning(date); };

  return (
    <main className="room-main calendar" data-dragging={dragging ? "" : undefined}>
      <DateControls>
        <nav className="cal-nav" aria-label="Month">
          <button type="button" className="cal-step" aria-label="Previous month" onClick={() => setMonth(stepMonth(month, -1))}>‹</button>
          <span className="cal-month-name" aria-live="polite">{monthLabel(month, narrow)}</span>
          <button type="button" className="cal-step" aria-label="Next month" onClick={() => setMonth(stepMonth(month, 1))}>›</button>
          {month !== monthOf(all.today) && <button type="button" className="room-button is-quiet cal-today" onClick={() => setMonth(monthOf(all.today))}>Today</button>}
        </nav>
      </DateControls>
      <HeaderControls>
        <div className="cal-show" role="group" aria-label="Show">
          <button type="button" className="room-toggle" aria-pressed={show.due} title="Show tasks on their due day" onClick={() => toggle("due")}>Due</button>
          <button type="button" className="room-toggle" aria-pressed={show.plans} title="Show planned time" onClick={() => toggle("plans")}>Plans</button>
        </div>
      </HeaderControls>
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
        <div className="cal-frame">
          <div className="cal-month" role="grid" aria-label={monthLabel(month)} aria-busy={live === undefined || undefined}>
            <div className="cal-weekdays" role="row">
              {WEEKDAYS.map((d) => <span key={d} role="columnheader" className="cal-weekday">{narrow ? d[0] : d}</span>)}
            </div>
            <div className="cal-days" style={{ ["--weeks" as string]: days.length / 7 }}>
              {days.map((date) => {
                const items = dayItems(date, events.get(date) ?? [], tasks, all.blocks)
                  .filter((x) => (x.kind !== "task" || show.due) && (x.kind !== "plan" || show.plans));
                return (
                  <DayCell key={date} date={date} today={all.today} inMonth={monthOf(date) === month} items={items} room={room}
                    epics={epics} narrow={narrow} offline={actions.offline}
                    onOpen={open} onAdd={() => add(date)} onPlan={() => plan(date)}
                    onMore={(rest, at) => setPop({ kind: "more", date, rest, at })}
                    onMenu={(at) => setPop({ kind: "menu", date, at })} />
                );
              })}
            </div>
          </div>
          <Tray tasks={undated} epics={epics} onOpen={open} />
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && <div className="cal-ghost"><TaskChip task={dragging} epic={dragging.epic_id ? epics.get(dragging.epic_id) : undefined} today={all.today} /></div>}
        </DragOverlay>
      </DndContext>

      {pop && (
        <Popover at={pop.at} onClose={() => setPop(null)} label={pop.kind === "more" ? `${longDate(pop.date)}, ${pop.rest.length} more` : longDate(pop.date)}>
          {pop.kind === "more" ? (
            <>
              <p className="cal-pop-head">{longDate(pop.date)} · {pop.rest.length} more</p>
              <ul className="cal-pop-list">
                {pop.rest.map((x) => <li key={x.key}><Item item={x} epics={epics} today={all.today} onOpen={open} /></li>)}
              </ul>
            </>
          ) : (
            <div className="cal-menu" role="menu" aria-label={longDate(pop.date)}>
              <p className="cal-pop-head">{longDate(pop.date)}</p>
              <button type="button" role="menuitem" disabled={actions.offline} onClick={() => add(pop.date)}><PlusIcon size={15} /> New task</button>
              <button type="button" role="menuitem" onClick={() => plan(pop.date)}><PlanModeIcon size={16} /> Plan this day</button>
            </div>
          )}
        </Popover>
      )}

      {planning && <PlanSheet date={planning} onOpen={setViewing} onClose={() => setPlanning(null)} />}
      {viewTask && (
        <TaskView key={viewTask.id} task={viewTask} today={all.today} offline={actions.offline} epics={all.epics} tagPool={tags}
          epic={viewTask.epic_id ? epics.get(viewTask.epic_id) : undefined}
          onClose={() => setViewing(null)}
          onTick={(done) => actions.move(viewTask.id, { done }, `${done ? "Done" : "Reopened"}: ${viewTask.title}`)}
          onPlan={() => actions.plan(viewTask.id, all.today)}
          onTomorrow={() => void actions.save(viewTask.id, { due: addDays(all.today, 1) })}
          onSave={(patch) => actions.save(viewTask.id, patch)}
          onDelete={() => { actions.remove(viewTask.id); setViewing(null); }} />
      )}
      {draft && (
        <TaskView key="new" task={draft} today={all.today} offline={actions.offline} epics={all.epics} tagPool={tags} editTitle
          epic={draft.epic_id ? epics.get(draft.epic_id) : undefined}
          onClose={() => setDraft(null)}
          onSave={(patch) => { setDraft((d) => d && { ...d, ...patch }); return Promise.resolve(true); }}
          onCreate={async () => {
            const { title, due, time, priority, estimate_mins, tags: tg, epic_id, description, note, link, status, checklist } = draft;
            if (!title.trim()) return false;
            return actions.add({
              title: title.trim(), due, time, priority, estimate_mins, tags: tg, epic_id, description, note, link, status,
              ...(checklist?.length ? { checklist } : null),
            });
          }} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}

type CellProps = {
  date: string; today: string; inMonth: boolean; items: DayItem[]; room: number; epics: Map<string, Epic>; narrow: boolean; offline: boolean;
  onOpen: (id: string) => void; onAdd: () => void; onPlan: () => void;
  onMore: (rest: DayItem[], at: DOMRect) => void; onMenu: (at: DOMRect) => void;
};

// One day: its number, what's on (folded to "+n" past what fits), and, under a mouse, + and Plan. A long press
// (touch, on the day rather than on a task) opens the same two as a menu.
function DayCell({ date, today, inMonth, items, room, epics, narrow, offline, onOpen, onAdd, onPlan, onMore, onMenu }: CellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: DAY + date });
  const cell = useRef<HTMLDivElement | null>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const pressed = useRef(false);
  const { shown, rest } = fold(items, room);
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const down = (e: RPointerEvent) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest(".cal-item, .cal-more, .cal-day-acts")) return;
    const { clientX: x, clientY: y } = e;
    pressed.current = false;
    press.current = {
      x, y, timer: window.setTimeout(() => {
        pressed.current = true;
        navigator.vibrate?.(10);
        if (cell.current) onMenu(cell.current.getBoundingClientRect());
      }, LONG_PRESS_MS),
    };
  };
  const move = (e: RPointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel();
  };
  const day = Number(date.slice(8));
  return (
    <div
      ref={(el) => { setNodeRef(el); cell.current = el; }}
      role="gridcell"
      aria-label={longDate(date)}
      className={`cal-day${inMonth ? "" : " is-out"}${date === today ? " is-today" : ""}${date < today ? " is-past" : ""}${isOver ? " is-over" : ""}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onContextMenu={(e) => { if (pressed.current || press.current) e.preventDefault(); }}
    >
      <div className="cal-day-top">
        <span className="cal-day-n">{day === 1 && !narrow ? compactDate(date).split(" ").slice(1).join(" ") : day}</span>
        <span className="cal-day-acts">
          <button type="button" className="cal-act" aria-label={`New task on ${longDate(date)}`} title="New task" disabled={offline} onClick={onAdd}>
            <PlusIcon size={13} />
          </button>
          <button type="button" className="cal-act cal-act-plan" aria-label={`Plan ${longDate(date)}`} title="Plan this day" onClick={onPlan}>
            Plan
          </button>
        </span>
      </div>
      <ul className="cal-items">
        {shown.map((x) => <li key={x.key}><Item item={x} epics={epics} today={today} onOpen={onOpen} drag /></li>)}
      </ul>
      {rest.length > 0 && (
        <button type="button" className="cal-more" aria-label={`${rest.length} more on ${longDate(date)}`}
          onClick={(e) => onMore(rest, (e.currentTarget.closest(".cal-day") as HTMLElement).getBoundingClientRect())}>
          +{rest.length}
        </button>
      )}
    </div>
  );
}

function Item({ item, epics, today, onOpen, drag = false }: { item: DayItem; epics: Map<string, Epic>; today: string; onOpen: (id: string) => void; drag?: boolean }) {
  if (item.kind === "event") {
    return (
      <span className={`cal-item cal-ev${item.colour ? " has-cal" : ""}${item.allDay ? " is-allday" : ""}`} title={item.title}
        style={item.colour ? { ["--cal" as string]: `var(--cal-${item.colour})` } : undefined}>
        {item.time && <span className="cal-time">{clock12(item.time)}</span>}
        <span className="cal-text">{item.title}</span>
      </span>
    );
  }
  const t = item.task;
  const epic = t.epic_id ? epics.get(t.epic_id) : undefined;
  if (item.kind === "plan") {
    return (
      <button type="button" className="cal-item-open" onClick={() => onOpen(t.id)}>
        <span className={`cal-item cal-plan${t.done ? " is-done" : ""}`} title={`Planned ${clock12(item.start)}, ${item.mins}m: ${t.title}`}>
          <span className="cal-time">{clock12(item.start)}</span>
          <span className="cal-text">{t.title}</span>
        </span>
      </button>
    );
  }
  return drag && !t.done ? <DraggableTask task={t} epic={epic} today={today} onOpen={onOpen} />
    : <button type="button" className="cal-item-open" onClick={() => onOpen(t.id)}><TaskChip task={t} epic={epic} today={today} /></button>;
}

function DraggableTask({ task, epic, today, onOpen }: { task: FullTask; epic?: Epic; today: string; onOpen: (id: string) => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id });
  return (
    <button ref={setNodeRef} type="button" className={`cal-item-open${isDragging ? " is-lifted" : ""}`} {...attributes} {...listeners}
      aria-roledescription="draggable task" onClick={() => onOpen(task.id)}>
      <TaskChip task={task} epic={epic} today={today} />
    </button>
  );
}

// A task as the month prints it: a slip of paper in its epic's colour, solid-edged (events are hatched glass).
function TaskChip({ task: t, epic, today }: { task: FullTask; epic?: Epic; today: string }) {
  const high = !t.done && effectivePriority(t, epic) === "high";
  const late = !t.done && !!t.due && t.due < today;
  return (
    <span className={`cal-item cal-task${epic?.colour ? " has-epic" : ""}${t.done ? " is-done" : ""}${high ? " is-high" : ""}${late ? " is-late" : ""}`}
      style={epicStyle(epic) as CSSProperties | undefined} title={t.title}>
      {t.time && <span className="cal-time">{clock12(t.time)}</span>}
      <span className="cal-text">{t.title}</span>
    </span>
  );
}

// The undated: open tasks with no due date, to drag onto a day. Dropping a dated task here takes its date off.
function Tray({ tasks, epics, onOpen }: { tasks: FullTask[]; epics: Map<string, Epic>; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY });
  const [q, setQ] = useState("");
  const shown = q.trim() ? tasks.filter((t) => t.title.toLowerCase().includes(q.trim().toLowerCase())) : tasks;
  return (
    <aside ref={setNodeRef} className={`cal-tray${isOver ? " is-over" : ""}`} aria-label="No due date">
      <div className="cal-tray-head">
        <h2 className="cal-tray-title">No date <span className="count-chip">{tasks.length}</span></h2>
        {tasks.length > 8 && <input type="search" className="cal-tray-find" placeholder="Find" aria-label="Find an undated task" value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {tasks.length === 0 ? <p className="cal-tray-none">Every open task has a date. Drag one here to take its date off.</p> : (
        <ul className="cal-tray-list">
          {shown.map((t) => <li key={t.id}><DraggableTask task={t} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today="" onOpen={onOpen} /></li>)}
        </ul>
      )}
    </aside>
  );
}

// A small card by the day it's about, kept on screen; Escape or a tap away closes it.
function Popover({ at, label, onClose, children }: { at: DOMRect; label: string; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const id = window.setTimeout(() => document.addEventListener("pointerdown", away)); // not the press that opened it
    document.addEventListener("keydown", esc);
    root.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  const w = Math.min(280, window.innerWidth - 24);
  const left = Math.max(12, Math.min(at.left + at.width / 2 - w / 2, window.innerWidth - w - 12));
  const below = at.top + 40 < window.innerHeight / 2;
  const style: CSSProperties = below ? { left, top: at.top + 28, width: w } : { left, bottom: window.innerHeight - at.bottom + 8, width: w };
  return <div ref={root} className="cal-pop" role="dialog" aria-label={label} style={style}>{children}</div>;
}
