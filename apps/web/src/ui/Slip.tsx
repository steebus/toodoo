import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { effectivePriority, plusHigh, TASK_STATUS_LABEL, type Epic } from "@shared/epics.ts";
import { dayWord, formatDuration } from "@shared/planning.ts";
import { parseQuickAdd, QUICKADD_HINT } from "@shared/quickadd.ts";
import { assignedToClaude } from "@shared/assign.ts";
import { ParsedChips } from "./QuickAdd";
import { checklistProgress, type FullTask } from "@shared/snapshot.ts";
import { waitingDays } from "@shared/board.ts";
import type { WorkTask } from "../lib/useWork";
import { shortDate } from "./format";
import { justDropped } from "./LaneDnd";
import { ColumnSwipe } from "./ColumnSwipe";
import { Paperclip } from "./Paperclip";

type Variant = "card" | "strip";
type Props = {
  task: FullTask; epic?: Epic; today: string; variant?: Variant; showEpic?: boolean; showStatus?: boolean;
};

// An epic's colour, for the band down a task's left edge (rooms.css, pass.css).
export const epicStyle = (e?: { colour?: string | null } | null) =>
  e?.colour ? ({ ["--epic" as string]: `var(--epic-${e.colour})` } as CSSProperties) : undefined;

// When, as a docket prints it: carried tasks count their days in red, near ones say the day.
export function when(t: FullTask, today: string) {
  if (t.done) return { text: t.done_on ? `DONE ${dayWord(t.done_on, today).toUpperCase()}` : "DONE", late: false };
  if (!t.due) return { text: "", late: false };
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
  const flag = high ? <span className="slip-high">{plusHigh(t, epic) ? "! +HIGH" : "! HIGH"}</span> : null;
  const list = checklistProgress(t.checklist);
  const steps = list ? <span className="slip-list" aria-label={`Checklist ${list.done} of ${list.total}`}>☐ {list.done}/{list.total}</span> : null;
  const status = showStatus && !t.done && t.status && t.status !== "todo"
    ? <span className={`slip-status is-${t.status}`}>{TASK_STATUS_LABEL[t.status].toUpperCase()}</span>
    : null;
  const clip = t.attachments ? <Paperclip n={t.attachments} className="slip-clip" /> : null;
  if (variant === "strip") {
    return (
      <>
        {clip}
        <span className="slip-title"><span className="slip-title-text">{t.title.toUpperCase()}</span></span>
        <span className="slip-meta">
          {steps}
          {status}
          {flag}
          <span className={w.late ? "slip-late" : undefined}>{w.text}</span>
        </span>
      </>
    );
  }
  return (
    <>
      {clip}
      <span className="slip-line">
        <span className={w.late ? "slip-late" : undefined}>{w.text}</span>
        <span className="slip-line-end">
          {steps}
          {t.estimate_mins ? <span>~{formatDuration(t.estimate_mins)}</span> : null}
        </span>
      </span>
      <span className="slip-title"><span className="slip-title-text">{t.title.toUpperCase()}</span></span>
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
  swipe?: { columns: string[]; from: number; onMove: (to: number) => void }; // on the phone: swipe across columns
};

// A slip in a lane: drag it (mouse, long press, or Space then arrows), click or Enter to open it. On the phone it
// also swipes sideways between columns (ColumnSwipe), the paper sliding over what it uncovers.
export function SortableSlip({ lane, onOpen, onKey, disabled, swipe, ...p }: SortableProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.task.id, data: { type: "task", lane }, disabled,
  });
  const v = p.variant ?? "card";
  const paper = `slip slip-${v}${p.task.done ? " is-done" : ""}${isDragging ? " is-lifted" : ""}${p.epic?.colour ? " has-epic" : ""}${assignedToClaude(p.task) ? " is-claude" : ""}`;
  return (
    <li
      ref={setNodeRef}
      className={swipe ? "slip-holder" : paper}
      style={{ transform: CSS.Translate.toString(transform), transition, ...(swipe ? undefined : epicStyle(p.epic)) }}
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
      {swipe ? (
        <ColumnSwipe {...swipe} held={isDragging} disabled={!!disabled} className={paper} style={epicStyle(p.epic)}>
          <SlipPrint {...p} />
        </ColumnSwipe>
      ) : <SlipPrint {...p} />}
    </li>
  );
}

// The slip under the pointer while it is dragged.
export function SlipGhost(p: Props) {
  return (
    <div className={`slip slip-${p.variant ?? "card"} is-ghost${p.epic?.colour ? " has-epic" : ""}`} style={epicStyle(p.epic)}>
      <SlipPrint {...p} />
    </div>
  );
}

// One line at the head or foot of a lane: the quick add's grammar ("tomorrow 3pm high #work 45m").
export function LaneAdd({ today, label, extra, onAdd, disabled, epics }: {
  today: string; label: string; extra: Partial<WorkTask>; onAdd: (t: WorkTask) => Promise<boolean>; disabled?: boolean;
  epics?: Epic[]; // given, +epic files the task (the lane's own epic otherwise)
}) {
  const [line, setLine] = useState("");
  const p = parseQuickAdd(line, today, 0, epics);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!p.title.trim()) return;
    const typed = line;
    setLine("");
    void onAdd({
      title: p.title, due: p.due, time: p.time, priority: p.priority, tags: p.tags, estimate_mins: p.estimate_mins, ...extra,
      ...(p.epic_id ? { epic_id: p.epic_id } : null), ...(p.assignee ? { assignee: p.assignee } : null),
    }).then((ok) => ok || setLine((cur) => cur || typed));
  };
  return (
    <form className="lane-add" onSubmit={submit}>
      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={epics ? QUICKADD_HINT : QUICKADD_HINT.replace(/ \+epic$/, "")} aria-label={label} disabled={disabled} autoComplete="off" spellCheck={false} />
      <ParsedChips parsed={p} epics={epics} />
    </form>
  );
}
