import { m } from "motion/react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { NO_EPIC, NO_TAG } from "@shared/board.ts";
import { epicMap } from "@shared/epics.ts";
import { addDays, type Priority } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { bandY, BANDS, dueAt, jitter, priorityAt, radius, urgencyX } from "../lib/matrix";
import { useNarrow } from "../lib/useNarrow";
import { docket } from "./build";
import { DocketGhost } from "./Docket";
import type { WorkActions, WorkData } from "../lib/useWork";
import { compactDate } from "./format";
import { MotionRoot, SNAPPY } from "./motion";
import { TaskView } from "./TaskView";
import { Toast } from "./Toast";

type Status = "open" | "todo" | "doing" | "blocked" | "done" | "all";
type Prefs = { status: Status; epic: string; tag: string; source: string };
const STATUSES: [Status, string][] = [["open", "Open"], ["todo", "To do"], ["doing", "Doing"], ["blocked", "Blocked"], ["done", "Done"], ["all", "All"]];
const KEY = "toodoo.matrixView";
const FRESH: Prefs = { status: "open", epic: "", tag: "", source: "" };
function loadPrefs(): Prefs {
  try {
    return { ...FRESH, ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null) };
  } catch {
    return FRESH;
  }
}

const PRIORITY_WORD: Record<string, string> = { high: "high", med: "med", low: "low", none: "no priority" };
const word = (p: Priority | null) => PRIORITY_WORD[p ?? "none"];
const statusOf = (t: FullTask) => (t.done ? "done" : t.status ?? "todo");
const DRAG_SLOP = 4;
// Day marks under the plot, so a drag can be aimed at a date.
const MARKS: [number, string][] = [[-7, "−1w"], [0, "today"], [2, "+2d"], [7, "+1w"], [14, "+2w"], [30, "+1m"]];

export function shown(work: WorkData, p: Prefs): FullTask[] {
  return work.tasks.filter((t) =>
    (p.status === "all" || (p.status === "open" ? !t.done : statusOf(t) === p.status))
    && (!p.epic || (p.epic === NO_EPIC ? !t.epic_id : t.epic_id === p.epic))
    && (!p.tag || (p.tag === NO_TAG ? !t.tags.length : t.tags.includes(p.tag)))
    && (!p.source || t.source === p.source));
}

type Drag = { id: string; x0: number; y0: number; x: number; y: number; moved: boolean };

// The Eisenhower matrix: every task as a dot, urgent to the left (by due date), important at the top (by priority),
// as big as the work left in it and in its epic's colour. Hover shows its ticket as it hangs on the Day (on a phone a
// tap does, as a stub, and a second tap opens it); a click opens it, and a drag moves its due date (across) and
// priority (up and down).
export function Matrix({ work, actions }: { work: WorkData; actions: WorkActions }) {
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* the choice holds for this visit */ }
  };
  const epics = useMemo(() => epicMap(work.epics), [work.epics]);
  const tags = useMemo(() => [...new Set(work.tasks.flatMap((t) => t.tags))].sort(), [work.tasks]);
  const sources = useMemo(() => [...new Set(work.tasks.map((t) => t.source))].sort(), [work.tasks]);
  const tasks = useMemo(() => shown(work, prefs), [work, prefs]);
  const [viewing, setViewing] = useState<string | null>(null);
  const viewTask = viewing ? work.tasks.find((t) => t.id === viewing) : undefined;
  const plot = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const narrow = useNarrow();
  const off = actions.offline;
  const today = work.today;

  // Biggest first, so the small ones sit on top and stay clickable.
  const dots = useMemo(() => tasks.map((t) => {
    const [jx, jy] = jitter(t.id);
    return { t, x: urgencyX(t.due, today) + jx, y: bandY(t.priority) + jy, r: radius(t.estimate_mins, work.spent?.[t.id]) };
  }).sort((a, b) => b.r - a.r), [tasks, today, work.spent]);

  // A drop (or an arrow key) asks for this due date and priority; only what changed is written, with Undo.
  const place = (t: FullTask, due: string, priority: Priority | null) => {
    const patch: Partial<FullTask> = {};
    if (due !== t.due) patch.due = due;
    if (priority !== t.priority) patch.priority = priority;
    if (!Object.keys(patch).length) return;
    actions.move(t.id, patch, `${[patch.due && `Due ${compactDate(due)}`, "priority" in patch && word(priority)].filter(Boolean).join(" · ")}: ${t.title}`);
  };
  const at = (e: PointerEvent) => {
    const r = plot.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const pointer = (t: FullTask, x: number, y: number) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || off) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDrag({ id: t.id, x0: e.clientX, y0: e.clientY, x, y, moved: false });
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.id !== t.id) return;
      const moved = drag.moved || Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > DRAG_SLOP;
      if (moved) setDrag({ ...drag, ...at(e), moved });
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      if (!drag || drag.id !== t.id) return;
      setDrag(null);
      if (drag.moved) place(t, dueAt(drag.x, today), priorityAt(drag.y));
      else if (e.pointerType === "touch" && tip !== t.id) setTip(t.id); // no hover on glass: the first tap shows it
      else setViewing(t.id);
    },
    onPointerCancel: () => setDrag(null),
    onPointerEnter: (e: PointerEvent<HTMLButtonElement>) => e.pointerType === "mouse" && setTip(t.id),
    onPointerLeave: (e: PointerEvent<HTMLButtonElement>) => e.pointerType === "mouse" && setTip((x) => (x === t.id ? null : x)),
    onFocus: () => setTip(t.id),
    onBlur: () => setTip((x) => (x === t.id ? null : x)),
  });
  // ← → a day earlier or later, ↑ ↓ a priority up or down; Enter (a click) opens it.
  const onKey = (t: FullTask, e: KeyboardEvent) => {
    const i = BANDS.indexOf(t.priority);
    const step: Record<string, () => void> = {
      ArrowLeft: () => place(t, addDays(t.due, -1), t.priority),
      ArrowRight: () => place(t, addDays(t.due, 1), t.priority),
      ArrowUp: () => place(t, t.due, BANDS[Math.max(0, i - 1)]),
      ArrowDown: () => place(t, t.due, BANDS[Math.min(BANDS.length - 1, i + 1)]),
    };
    if (!step[e.key] || off) return;
    e.preventDefault();
    step[e.key]();
  };

  const pick = (label: string, key: keyof Prefs, options: [string, string][]) => (
    <label className="room-pick">
      <span>{label}</span>
      <select value={prefs[key]} onChange={(e) => setPrefs({ ...prefs, [key]: e.target.value })}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  const dragged = drag?.moved ? dots.find((d) => d.t.id === drag.id) : undefined;
  const held = (id: string) => !!drag?.moved && drag.id === id;
  const shownTip = dots.find((d) => d.t.id === (dragged ? drag!.id : tip));
  return (
    <MotionRoot>
    <main className="room-main matrix">
      <div className="room-head">
        <h1 className="room-title">Matrix</h1>
        <span className="count-chip">{tasks.length}</span>
        <span className="room-head-gap" />
        {pick("Status", "status", STATUSES)}
        {pick("Epic", "epic", [["", "All"], ...work.epics.filter((e) => e.status !== "done" || e.id === prefs.epic).map((e): [string, string] => [e.id, e.title]), [NO_EPIC, "No epic"]])}
        {pick("Tag", "tag", [["", "All"], ...tags.map((x): [string, string] => [x, x]), [NO_TAG, "Untagged"]])}
        {pick("Source", "source", [["", "All"], ...sources.map((x): [string, string] => [x, x])])}
      </div>
      <div className="mx-frame">
        <div className="mx-plot" ref={plot} role="group" aria-label="Tasks by urgency and importance"
          onPointerDown={(e) => e.target === e.currentTarget && setTip(null)}>
          <span className="mx-q mx-q-do" aria-hidden>DO</span>
          <span className="mx-q mx-q-plan" aria-hidden>PLAN</span>
          <span className="mx-q mx-q-pass" aria-hidden>HAND OFF</span>
          <span className="mx-q mx-q-drop" aria-hidden>DROP</span>
          {MARKS.map(([d, l]) => (
            <span key={l} className="mx-mark" style={{ left: `${urgencyX(addDays(today, d), today) * 100}%` }} aria-hidden>{l}</span>
          ))}
          {dots.map(({ t, x, y, r }) => {
            const held = drag?.moved && drag.id === t.id;
            const e = t.epic_id ? epics.get(t.epic_id) : undefined;
            return (
              <m.button key={t.id} type="button" className={`mx-dot${t.done ? " is-done" : ""}${held ? " is-held" : ""}`}
                aria-label={`${t.title}, due ${compactDate(t.due)}, ${word(t.priority)}`}
                data-r={r} style={{ width: `calc(${r * 2}px * var(--mx-k, 1))`, height: `calc(${r * 2}px * var(--mx-k, 1))`, ["--dot" as string]: e?.colour ? `var(--epic-${e.colour})` : "var(--ink-3)" }}
                initial={false}
                animate={{ left: `${(held ? drag!.x : x) * 100}%`, top: `${(held ? drag!.y : y) * 100}%` }}
                transition={held ? { duration: 0 } : SNAPPY}
                onKeyDown={(ev) => onKey(t, ev)} {...pointer(t, x, y)}>
              </m.button>
            );
          })}
          {shownTip && (() => {
            const { t, x, y, r } = shownTip;
            const px = held(t.id) ? drag!.x : x, py = held(t.id) ? drag!.y : y;
            return (
              <div className={`mx-card${narrow ? " is-stub" : ""}${py < 0.42 ? " is-below" : ""}${px < 0.2 ? " is-left" : px > 0.8 ? " is-right" : ""}`}
                style={{ left: `${px * 100}%`, top: `${py * 100}%`, ["--r" as string]: `${r}px` }}
                onClick={() => setViewing(t.id)} aria-hidden>
                <DocketGhost docket={docket(t, t.time, today, t.epic_id ? epics.get(t.epic_id) : undefined, work.spent?.[t.id])} compact={narrow} />
              </div>
            );
          })()}
          {dragged && (
            <span className="mx-ask" style={{ left: `${drag!.x * 100}%`, top: `${drag!.y * 100}%`, ["--r" as string]: `${dragged.r}px` }} aria-hidden>
              {compactDate(dueAt(drag!.x, today))} · {word(priorityAt(drag!.y))}
            </span>
          )}
        </div>
        <span className="mx-axis mx-axis-x" aria-hidden><b>URGENT</b><b>LATER</b></span>
        <span className="mx-axis mx-axis-y" aria-hidden><b>LESS SO</b><b>IMPORTANT</b></span> {/* read bottom to top */}
      </div>
      {viewTask && (
        <TaskView key={viewTask.id} task={viewTask} today={today} offline={off} epics={work.epics} tagPool={tags}
          epic={viewTask.epic_id ? epics.get(viewTask.epic_id) : undefined}
          onClose={() => setViewing(null)}
          onTick={(done) => actions.move(viewTask.id, { done }, `${done ? "Done" : "Reopened"}: ${viewTask.title}`)}
          onTomorrow={() => void actions.save(viewTask.id, { due: addDays(today, 1) })}
          onSave={(patch) => actions.save(viewTask.id, patch)}
          onDelete={() => actions.remove(viewTask.id)} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
    </MotionRoot>
  );
}
