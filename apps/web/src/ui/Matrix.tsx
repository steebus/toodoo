import { m } from "motion/react";
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { NO_EPIC, NO_TAG } from "@shared/board.ts";
import { epicMap, plusHigh } from "@shared/epics.ts";
import { addDays, type Priority } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { bandY, BANDS, dueAt, jitter, priorityAt, radius, urgencyX } from "../lib/matrix";
import { useNarrow } from "../lib/useNarrow";
import { docket } from "./build";
import { DocketGhost } from "./Docket";
import type { WorkActions, WorkData } from "../lib/useWork";
import { compactDate } from "./format";
import { SNAPPY } from "./motion";
import { HeaderControls } from "./RoomShell";
import { TaskView } from "./TaskView";
import { SettingsMenu, SettingsPick } from "./ViewMenu";
import { Toast } from "./Toast";

type Status = "open" | "backlog" | "todo" | "doing" | "blocked" | "done" | "all";
type Prefs = { status: Status; epic: string; tag: string; source: string };
const STATUSES: [Status, string][] = [["open", "Open"], ["backlog", "Backlog"], ["todo", "To do"], ["doing", "Doing"], ["blocked", "Blocked"], ["done", "Done"], ["all", "All"]];
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
const blocked = (t: FullTask) => !t.done && t.status === "blocked";
const statusOf = (t: FullTask) => (t.done ? "done" : t.status ?? "todo");
const DRAG_SLOP = 4;
// A dot as drawn: a blot of marker, and a pen ring round it that doesn't quite close.
const BLOT = "M20.6 4.2c8.9.4 15.6 7.3 15.2 16.3-.4 8.8-7.6 15.4-16.5 15-8.6-.4-15-7.4-14.7-16.1C4.9 10.6 11.8 3.8 20.6 4.2z";
// A blocked task is no blot but a square, drawn by hand, so it reads as stuck by shape alone.
const SQUARE = "M5.1 5.4C14 4.3 27 5 35.2 4.6c.7 9.6.2 20.6.6 30.9-9.8.9-20.9.3-31 .6C4.5 26 5.4 15.6 5.1 5.4z";
const SQUARE_RING = "M4.2 6.1C13.6 4.9 26.4 5.6 36 4.5c.9 10.3.1 20.4.8 31.2-10.4.7-21.6.1-32.2.8-.7-9.6-.1-19.7-.4-30.4M4.6 5.9L8 5";
const RING = "M23.5 4.6c7.9 1.3 13.2 8.6 12.1 16.9-1.2 8.6-8.9 14.4-17.4 13.2C9.7 33.5 4 25.9 5.2 17.4 6.3 9.7 12.8 4.1 20.9 4.3";
// Day marks under the plot, so a drag can be aimed at a date.
const MARKS: [number, string][] = [[-7, "last week"], [0, "today"], [2, "+2 days"], [7, "next week"], [14, "+2 wks"], [30, "a month"]];

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
    // +high (a high task in a high epic) rides at the very top of the high band
    const top = plusHigh(t, t.epic_id ? epics.get(t.epic_id) : undefined);
    return { t, x: urgencyX(t.due ?? addDays(today, 365), today) + jx, y: bandY(t.priority) + (top ? -0.08 + jy / 4 : jy), r: radius(t.estimate_mins, work.spent?.[t.id]), turn: Math.round((jx / 0.03 + 0.5) * 360) };
  }).sort((a, b) => b.r - a.r), [tasks, today, work.spent, epics]);

  // A drop (or an arrow key) asks for this due date and priority; only what changed is written, with Undo.
  const place = (t: FullTask, due: string | null, priority: Priority | null) => {
    const patch: Partial<FullTask> = {};
    if (due !== t.due) patch.due = due;
    if (priority !== t.priority) patch.priority = priority;
    if (!Object.keys(patch).length) return;
    actions.move(t.id, patch, `${[patch.due && `Due ${compactDate(due!)}`, "priority" in patch && word(priority)].filter(Boolean).join(" · ")}: ${t.title}`);
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
      ArrowLeft: () => place(t, addDays(t.due ?? today, -1), t.priority),
      ArrowRight: () => place(t, addDays(t.due ?? today, 1), t.priority),
      ArrowUp: () => place(t, t.due, BANDS[Math.max(0, i - 1)]),
      ArrowDown: () => place(t, t.due, BANDS[Math.min(BANDS.length - 1, i + 1)]),
    };
    if (!step[e.key] || off) return;
    e.preventDefault();
    step[e.key]();
  };

  const pick = (label: string, key: keyof Prefs, options: [string, string][]) => (
    <SettingsPick label={label} value={prefs[key]} options={options} onChange={(v) => setPrefs({ ...prefs, [key]: v })} />
  );
  const dragged = drag?.moved ? dots.find((d) => d.t.id === drag.id) : undefined;
  const held = (id: string) => !!drag?.moved && drag.id === id;
  const shownTip = dots.find((d) => d.t.id === (dragged ? drag!.id : tip));
  return (
    <main className="room-main matrix">
      <h1 className="sr-only">Matrix</h1>
      <HeaderControls><SettingsMenu>
        {pick("Status", "status", STATUSES)}
        {pick("Epic", "epic", [["", "All"], ...work.epics.filter((e) => e.status !== "done" || e.id === prefs.epic).map((e): [string, string] => [e.id, e.title]), [NO_EPIC, "No epic"]])}
        {pick("Tag", "tag", [["", "All"], ...tags.map((x): [string, string] => [x, x]), [NO_TAG, "Untagged"]])}
        {pick("Source", "source", [["", "All"], ...sources.map((x): [string, string] => [x, x])])}
      </SettingsMenu></HeaderControls>
      <div className="mx-frame">
        <div className="mx-plot" ref={plot} role="group" aria-label="Tasks by urgency and importance"
          onPointerDown={(e) => e.target === e.currentTarget && setTip(null)}>
          {/* drawn on the paper: the do-now corner marked over in highlighter, the quarters ruled freehand */}
          <svg className="mx-ink" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path className="mx-highlight" d="M1.2 1.6 L49.2 0.9 L49.6 49.1 L0.9 49.6 Z" />
            <path className="mx-rule" d="M50.2 1.2 C49.6 18 50.7 33 49.9 50 S50.6 82 50.1 98.8" />
            <path className="mx-rule" d="M0.8 50.3 C18 49.5 33 50.8 50 49.9 S82 50.5 99.2 50.1" />
          </svg>
          <span className="mx-q mx-q-do" aria-hidden>do it</span>
          <span className="mx-q mx-q-plan" aria-hidden>plan it</span>
          <span className="mx-q mx-q-pass" aria-hidden>hand it off</span>
          <span className="mx-q mx-q-drop" aria-hidden>drop it?</span>
          {/* where a drag tips a task into the next priority: pencil across the sheet (the middle one is the biro rule) */}
          {BANDS.slice(1).map((p, i) => (
            <span key={i} className={`mx-cut${i === 1 ? " is-middle" : ""}`} style={{ top: `${((i + 1) / BANDS.length) * 100}%` }} aria-hidden>
              <b>{word(BANDS[i])} ↑</b><b>{word(p)} ↓</b>
            </span>
          ))}
          {MARKS.map(([d, l]) => (
            <span key={l} className={`mx-mark${d === 2 || d === 14 ? " is-minor" : ""}`} style={{ left: `${urgencyX(addDays(today, d), today) * 100}%` }} aria-hidden>{l}</span>
          ))}
          {dots.map(({ t, x, y, r, turn }) => {
            const lifted = held(t.id);
            const e = t.epic_id ? epics.get(t.epic_id) : undefined;
            return (
              <m.button key={t.id} type="button" className={`mx-dot${t.done ? " is-done" : ""}${blocked(t) ? " is-blocked" : ""}${lifted ? " is-held" : ""}`}
                aria-label={`${t.title}${blocked(t) ? ", blocked" : ""}, ${t.due ? `due ${compactDate(t.due)}` : "no due date"}, ${word(t.priority)}`}
                data-r={r} style={{ width: `calc(${r * 2}px * var(--mx-k, 1))`, height: `calc(${r * 2}px * var(--mx-k, 1))`, ["--dot" as string]: e?.colour ? `var(--epic-${e.colour})` : "var(--ink-3)" }}
                initial={false}
                animate={{ left: `${(lifted ? drag!.x : x) * 100}%`, top: `${(lifted ? drag!.y : y) * 100}%` }}
                transition={lifted ? { duration: 0 } : SNAPPY}
                onKeyDown={(ev) => onKey(t, ev)} {...pointer(t, x, y)}>
                {/* a marker blot, ringed in pen; each one turned its own way so no two look stamped */}
                <svg viewBox="0 0 40 40" aria-hidden style={{ rotate: `${turn}deg` }}>
                  {blocked(t) ? (
                    <>
                      <path className="mx-blot" d={SQUARE} />
                      <path className="mx-ring" d={SQUARE_RING} />
                    </>
                  ) : (
                    <>
                      <path className="mx-blot" d={BLOT} />
                      <path className="mx-ring" d={RING} />
                    </>
                  )}
                </svg>
              </m.button>
            );
          })}
          {shownTip && (() => {
            const { t, x, y, r } = shownTip;
            const px = held(t.id) ? drag!.x : x, py = held(t.id) ? drag!.y : y;
            return (
              <div className={`mx-card${narrow ? " is-stub" : ""}${py < 0.42 ? " is-below" : ""}${px < 0.2 ? " is-left" : px > 0.8 ? " is-right" : ""}`}
                style={{ left: `${px * 100}%`, top: `${py * 100}%`, ["--r" as string]: `${r}px` }}
                onPointerDown={(e) => e.preventDefault()} /* keep the dot focused, so the card stays up for the tap */
                onClick={() => setViewing(t.id)}>
                <span className="mx-card-ghost" aria-hidden>
                  <DocketGhost docket={docket(t, t.time, today, t.epic_id ? epics.get(t.epic_id) : undefined, work.spent?.[t.id])} compact={narrow} />
                </span>
                {narrow && <button type="button" className="room-button mx-open" onClick={(e) => { e.stopPropagation(); setViewing(t.id); }}>Open</button>}
              </div>
            );
          })()}
          {dragged && (
            <span className="mx-ask" style={{ left: `${drag!.x * 100}%`, top: `${drag!.y * 100}%`, ["--r" as string]: `${dragged.r}px` }} aria-hidden>
              {compactDate(dueAt(drag!.x, today))} · {word(priorityAt(drag!.y))}
            </span>
          )}
        </div>
        <span className="mx-axis mx-axis-x" aria-hidden><b>← urgent</b><b>later →</b></span>
        <span className="mx-axis mx-axis-y" aria-hidden><b>less so</b><b>important →</b></span> {/* read bottom to top */}
      </div>
      {viewTask && (
        <TaskView key={viewTask.id} task={viewTask} today={today} offline={off} epics={work.epics} tagPool={tags}
          epic={viewTask.epic_id ? epics.get(viewTask.epic_id) : undefined}
          onClose={() => setViewing(null)}
          onTick={(done) => actions.move(viewTask.id, { done }, `${done ? "Done" : "Reopened"}: ${viewTask.title}`)}
          onPlan={() => actions.plan(viewTask.id, today)}
          onTomorrow={() => void actions.save(viewTask.id, { due: addDays(today, 1) })}
          onSave={(patch) => actions.save(viewTask.id, patch)}
          onDelete={() => actions.remove(viewTask.id)} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}
