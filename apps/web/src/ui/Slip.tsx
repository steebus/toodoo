import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { effectivePriority, TASK_STATUS_LABEL, type Epic } from "@shared/epics.ts";
import { dayWord, formatDuration } from "@shared/planning.ts";
import { parseQuickAdd } from "@shared/quickadd.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { waitingDays } from "@shared/board.ts";
import type { WorkTask } from "../lib/useWork";
import { shortDate } from "./format";
import { justDropped } from "./LaneDnd";

type Variant = "card" | "strip";
type Props = {
  task: FullTask; epic?: Epic; today: string; variant?: Variant; showEpic?: boolean; showStatus?: boolean;
};

// When, as a docket prints it: carried tasks count their days in red, near ones say the day.
function when(t: FullTask, today: string) {
  if (t.done) return { text: t.done_on ? `DONE ${dayWord(t.done_on, today).toUpperCase()}` : "DONE", late: false };
  if (t.due < today) {
    const n = waitingDays(t.due, today);
    return { text: `${n} ${n === 1 ? "DAY" : "DAYS"}`, late: true };
  }
  const near = t.due === today || dayWord(t.due, today) === "tomorrow";
  return { text: near ? dayWord(t.due, today).toUpperCase() : shortDate(t.due), late: false };
}

// The print on a task's paper slip: the Board's cards and the Epics screen's strips.
export function SlipPrint({ task: t, epic, today, variant = "card", showEpic = true, showStatus = false }: Props) {
  const w = when(t, today);
  const high = !t.done && effectivePriority(t, epic) === "high";
  const flag = high ? <span className="slip-high">! HIGH</span> : null;
  const status = showStatus && !t.done && t.status && t.status !== "todo"
    ? <span className={`slip-status is-${t.status}`}>{TASK_STATUS_LABEL[t.status].toUpperCase()}</span>
    : null;
  if (variant === "strip") {
    return (
      <>
        <span className="slip-title">{t.title.toUpperCase()}</span>
        <span className="slip-meta">
          {status}
          {flag}
          <span className={w.late ? "slip-late" : undefined}>{w.text}</span>
        </span>
      </>
    );
  }
  return (
    <>
      <span className="slip-line">
        <span className={w.late ? "slip-late" : undefined}>{w.text}</span>
        {t.estimate_mins ? <span>~{formatDuration(t.estimate_mins)}</span> : null}
      </span>
      <span className="slip-title">{t.title.toUpperCase()}</span>
      {(flag || (showEpic && epic) || t.tags.length > 0) && (
        <span className="slip-foot">
          {flag}
          {showEpic && epic && <span className="slip-epic">{epic.title.toUpperCase()}</span>}
          {t.tags.slice(0, 2).map((x) => <span key={x} className="slip-tag">#{x}</span>)}
        </span>
      )}
    </>
  );
}

type SortableProps = Props & {
  lane: string;
  onOpen: (id: string) => void;
  onKey?: (id: string, e: KeyboardEvent) => void;
  disabled?: boolean;
};

// A slip in a lane: drag it (mouse, long press, or Space then arrows), click or Enter to open it.
export function SortableSlip({ lane, onOpen, onKey, disabled, ...p }: SortableProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.task.id, data: { type: "task", lane }, disabled,
  });
  const v = p.variant ?? "card";
  return (
    <li
      ref={setNodeRef}
      className={`slip slip-${v}${p.task.done ? " is-done" : ""}${isDragging ? " is-lifted" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-slip={p.task.id}
      {...attributes}
      {...listeners}
      aria-roledescription="task"
      aria-label={p.task.title}
      onClick={() => justDropped() || onOpen(p.task.id)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === "Enter") { e.preventDefault(); onOpen(p.task.id); return; }
        onKey?.(p.task.id, e);
      }}
    >
      <SlipPrint {...p} />
    </li>
  );
}

// The slip under the pointer while it is dragged.
export function SlipGhost(p: Props) {
  return (
    <div className={`slip slip-${p.variant ?? "card"} is-ghost`}>
      <SlipPrint {...p} />
    </div>
  );
}

// One line at the head or foot of a lane: the quick add's grammar ("tomorrow 3pm high #work 45m").
export function LaneAdd({ today, label, extra, onAdd, disabled }: {
  today: string; label: string; extra: Partial<WorkTask>; onAdd: (t: WorkTask) => Promise<boolean>; disabled?: boolean;
}) {
  const [line, setLine] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = parseQuickAdd(line, today, 0);
    if (!p.title.trim()) return;
    const typed = line;
    setLine("");
    void onAdd({
      title: p.title, due: p.due ?? today, time: p.time, priority: p.priority, tags: p.tags, estimate_mins: p.estimate_mins, ...extra,
    }).then((ok) => ok || setLine((cur) => cur || typed));
  };
  return (
    <form className="lane-add" onSubmit={submit}>
      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="+ Add" aria-label={label} disabled={disabled} autoComplete="off" />
    </form>
  );
}
