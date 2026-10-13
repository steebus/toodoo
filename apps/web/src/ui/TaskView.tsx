import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { effectivePriority, EPIC_STATUS_LABEL, TASK_STATUS_LABEL, TASK_STATUSES, type Epic } from "@shared/epics.ts";
import { dayWord, fmtTime, formatDuration, parseDuration, type Priority } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { waitingDays } from "@shared/board.ts";
import { normLink, parseTags } from "@shared/validation.ts";
import { Checklist } from "./Checklist";
import { shortDate } from "./format";
import { CloseIcon, PenProgress, PenTick } from "./icons";
import { KitchenTimer } from "./KitchenTimer";

export type TaskViewActions = {
  onSave: (patch: Record<string, unknown>) => Promise<boolean>; // false: refused, so the field stays open with what was typed
  onTick?: (done: boolean) => void;
  onPlan?: () => void; // put it on the day's line
  onTomorrow?: () => void;
  onDelete?: () => void;
};

type Props = TaskViewActions & {
  task: FullTask;
  epic?: Epic;
  epics?: Epic[]; // to move it to another
  today: string;
  progress?: { spent: number; est: number } | null;
  offline?: boolean;
  focus?: { startM: number; endM: number }; // Focus: the room goes dark and a kitchen timer runs down the block
  editTitle?: boolean; // opened to edit (the e key): the title starts open
  onClose: () => void;
};

const DASH = "-".repeat(80);
const PRIORITIES: [Priority | null, string][] = [["high", "! HIGH"], ["med", "MED"], ["low", "LOW"], [null, "NONE"]];

// A task, its ticket: the docket blown up into a side sheet of thermal paper. Everything on it edits where it
// is printed: click the title, the date, a tag, the description... and type; Enter (or leaving it) keeps it,
// Escape puts it back. A native modal dialog: side sheet on desktop, bottom sheet on the phone.
export function TaskView({
  task: t, epic, epics = [], today, progress, offline = false, focus, editTitle, onClose, onSave, onTick, onPlan, onTomorrow, onDelete,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    if (!editTitle) d.querySelector<HTMLElement>(".tk-close")?.focus(); // as showModal would; Escape works at once
    return () => {
      if (d.open && typeof d.close === "function") d.close();
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, [editTitle]);

  const high = !t.done && effectivePriority(t, epic) === "high";
  const late = !t.done && t.due < today;
  const n = late ? waitingDays(t.due, today) : 0;
  const when = t.done
    ? `DONE ${t.done_on ? dayWord(t.done_on, today).toUpperCase() : ""}`.trim()
    : late ? `${n} ${n === 1 ? "DAY" : "DAYS"} OVER` : t.due === today || dayWord(t.due, today) === "tomorrow" ? dayWord(t.due, today).toUpperCase() : shortDate(t.due);
  const act = (fn?: () => void) => fn && (() => { fn(); onClose(); });
  const save = (patch: Record<string, unknown>) => (offline ? Promise.resolve(false) : onSave(patch));
  const open = epics.filter((e) => e.status !== "done" || e.id === t.epic_id);

  return (
    <dialog
      ref={dialog}
      className={`sheet sheet-ticket${focus ? " is-focus" : ""}`}
      aria-labelledby="ticket-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      {focus && <KitchenTimer startM={focus.startM} endM={focus.endM} />}
      <article className={`ticket${t.done ? " is-done" : ""}${high ? " is-high" : ""}`}
        style={epic?.colour ? { ["--epic" as string]: `var(--epic-${epic.colour})` } : undefined}>
        <button type="button" className="tk-close" aria-label="Close" onClick={onClose}><CloseIcon size={18} /></button>
        <div className="tk-head">
          <Field label="Date" kind="date" value={t.due} display={<span className={late ? "tk-late" : undefined}>{when}</span>}
            onSave={(v) => (v ? save({ due: v }) : Promise.resolve(true))} />
          <span className="tk-head-end">
            <Field label="Time" kind="time" value={t.time ?? ""} display={t.time ? fmtTime(t.time).toUpperCase() : ""} placeholder="+ TIME"
              onSave={(v) => save({ time: v || null })} />
            <Field label="Estimate" value={t.estimate_mins ? formatDuration(t.estimate_mins) : ""} placeholder="+ EST"
              display={t.estimate_mins ? `~${formatDuration(t.estimate_mins)}` : ""}
              check={(v) => { const m = parseDuration(v); return !v || (m != null && Number.isFinite(m) && m >= 1 && m <= 1440) ? null : "Like 45m or 1h 30m"; }}
              onSave={(v) => save({ estimate_mins: v || null })} />
          </span>
        </div>
        <p className="tk-dashes" aria-hidden>{DASH}</p>
        <div className="tk-title-row">
          <h2 id="ticket-title" className="tk-title">
            <Field label="Title" kind="line" value={t.title} startOpen={editTitle} display={<span className="tk-title-text">{t.title.toUpperCase()}</span>}
              check={(v) => (v.trim() ? null : "Needs a title")} onSave={(v) => save({ title: v.trim() })} />
          </h2>
          {t.done && <PenTick on draw className="tk-tick" />}
        </div>
        <div className="tk-chips" role="group" aria-label="Priority">
          {PRIORITIES.map(([p, label]) => (
            <button key={label} type="button" className={`tk-chip${p === "high" ? " is-high" : ""}`} aria-pressed={(t.priority ?? null) === p}
              disabled={offline} onClick={() => (t.priority ?? null) !== p && void save({ priority: p })}>{label}</button>
          ))}
          {t.source !== "you" && <span className="tk-source">{t.source.toUpperCase()} {(t.external_id ?? "").replace(/^\w+:/, "")}</span>}
        </div>
        {!t.done && (
          <div className="tk-chips" role="group" aria-label="Column">
            {TASK_STATUSES.map((s) => (
              <button key={s} type="button" className="tk-chip" aria-pressed={(t.status ?? "todo") === s} disabled={offline}
                onClick={() => (t.status ?? "todo") !== s && void save({ status: s })}>{TASK_STATUS_LABEL[s].toUpperCase()}</button>
            ))}
          </div>
        )}
        <label className="tk-epic">
          <span className="tk-epic-dot" aria-hidden />
          <select value={t.epic_id ?? ""} aria-label="Epic" disabled={offline} onChange={(e) => void save({ epic_id: e.target.value || null })}>
            <option value="">NO EPIC</option>
            {open.map((e) => (
              <option key={e.id} value={e.id}>{e.title.toUpperCase()}{e.status !== "active" ? ` · ${EPIC_STATUS_LABEL[e.status].toUpperCase()}` : ""}</option>
            ))}
          </select>
        </label>
        {progress && (
          <div className="tk-progress">
            <PenProgress {...progress} />
            <span>{formatDuration(progress.spent)} of {formatDuration(progress.est)}</span>
          </div>
        )}
        <p className="tk-dashes" aria-hidden>{DASH}</p>
        <Field label="Description" kind="text" value={t.description ?? ""} placeholder="+ Description" className="tk-body"
          display={t.description} onSave={(v) => save({ description: v.trim() || null })} />
        <Checklist items={t.checklist ?? []} onChange={(checklist) => void save({ checklist })} disabled={offline} />
        <Field label="Note" kind="text" value={t.note ?? ""} placeholder="+ Note" className="tk-note"
          display={t.note} onSave={(v) => save({ note: v.trim() || null })} />
        <div className="tk-link">
          {t.link && <a href={t.link} target="_blank" rel="noreferrer">{t.link.replace(/^https?:\/\//, "")}</a>}
          <Field label="Link" value={t.link ?? ""} placeholder={t.link ? "EDIT" : "+ Link"} display={null}
            check={(v) => (!v.trim() || normLink(v) !== undefined ? null : "Not a web address")}
            onSave={(v) => save({ link: v.trim() || null })} />
        </div>
        <Tags tags={t.tags} disabled={offline} onSave={(tags) => save({ tags })} />
        <p className="tk-dashes" aria-hidden>{DASH}</p>
        <div className="tk-actions">
          {onTick && (
            <button type="button" className="tk-act tk-primary" disabled={offline} onClick={act(() => onTick(!t.done))}>
              {t.done ? "Reopen" : "Done"}
            </button>
          )}
          {onPlan && !t.done && <button type="button" className="tk-act" disabled={offline} onClick={act(onPlan)}>Plan it</button>}
          {onTomorrow && !t.done && t.due <= today && <button type="button" className="tk-act" disabled={offline} onClick={act(onTomorrow)}>Tomorrow</button>}
          {onDelete && (
            <button type="button" className="tk-act tk-delete" disabled={offline} onClick={() => {
              // Its docket goes with it: focus goes on to the quick add (where there is one) rather than nowhere.
              opener.current = document.querySelector(".quickadd-input") ?? opener.current;
              onDelete();
              onClose();
            }}>Delete</button>
          )}
        </div>
      </article>
    </dialog>
  );
}

type FieldProps = {
  label: string;
  value: string;
  display: ReactNode; // as printed; empty shows the placeholder
  placeholder?: string;
  kind?: "word" | "line" | "text" | "date" | "time"; // word: a short input; line: wraps, Enter keeps; text: Enter is a new line
  className?: string;
  startOpen?: boolean;
  check?: (v: string) => string | null; // a problem with what was typed, shown under it
  onSave: (v: string) => Promise<boolean>;
};

// One printed value that edits where it is: a button as printed, then an input in its place.
function Field({ label, value, display, placeholder = "", kind = "word", className = "", startOpen = false, check, onSave }: FieldProps) {
  const [editing, setEditing] = useState(startOpen);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const shown = useRef<HTMLButtonElement>(null);
  const back = useRef(false); // an edit just ended from the keyboard: focus returns to the value, still in the ticket
  const begin = () => { setDraft(value); setProblem(null); setEditing(true); };
  useEffect(() => {
    if (editing || !back.current) return;
    back.current = false;
    shown.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!editing) return;
    const el = box.current;
    el?.focus();
    if (el && kind !== "date" && kind !== "time") el.setSelectionRange?.(el.value.length, el.value.length);
  }, [editing, kind]);
  const commit = async () => {
    if (!editing) return;
    if (draft === value) return setEditing(false);
    const bad = check?.(draft);
    if (bad) return setProblem(bad);
    setEditing(false);
    if (!(await onSave(draft))) setEditing(true); // refused: back open with what was typed
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); back.current = true; setEditing(false); setProblem(null); return; }
    if (e.key === "Enter" && (kind !== "text" || e.metaKey || e.ctrlKey)) { e.preventDefault(); back.current = true; void commit(); }
  };
  if (!editing) {
    const shownValue = display !== null && display !== undefined && display !== "" ? display : null;
    return (
      <button ref={shown} type="button" className={`tk-field ${className}${shownValue ? "" : " is-empty"}`}
        aria-label={`${label}${typeof shownValue === "string" ? `: ${shownValue}` : value ? `: ${value}` : ""}. Edit`} onClick={begin}>
        {shownValue ?? placeholder}
      </button>
    );
  }
  const common = {
    ref: box, value: draft, "aria-label": label, "aria-invalid": problem ? true : undefined, onKeyDown: keys,
    onBlur: () => void commit(), onChange: (e: { target: { value: string } }) => { setDraft(e.target.value); setProblem(null); },
  };
  return (
    <span className={`tk-editing ${className}`}>
      {kind === "line" || kind === "text"
        ? <textarea {...common} rows={kind === "line" ? Math.max(1, Math.ceil(draft.length / 22)) : 4} />
        : <input {...common} type={kind === "date" || kind === "time" ? kind : "text"} autoComplete="off" />}
      {problem && <small className="tk-problem" role="alert">{problem}</small>}
    </span>
  );
}

// Tags as printed, each with a cross; a line at the end adds (Enter, or a space or comma between several).
function Tags({ tags, disabled, onSave }: { tags: string[]; disabled?: boolean; onSave: (tags: string[]) => Promise<boolean> }) {
  const [line, setLine] = useState("");
  const add = () => {
    const more = parseTags(line).filter((x) => !tags.includes(x));
    setLine("");
    if (more.length) void onSave([...tags, ...more]);
  };
  return (
    <div className="tk-tags" role="group" aria-label="Tags">
      {tags.map((x) => (
        <span key={x} className="tk-tag">
          #{x}
          <button type="button" className="tk-tag-x" aria-label={`Remove tag ${x}`} disabled={disabled}
            onClick={() => void onSave(tags.filter((y) => y !== x))}><CloseIcon size={11} /></button>
        </span>
      ))}
      <input className="tk-tag-add" value={line} placeholder="+ tag" aria-label="Add a tag" disabled={disabled} maxLength={60}
        onChange={(e) => setLine(e.target.value)} onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(); }
          if (e.key === "Escape" && line) { e.preventDefault(); e.stopPropagation(); setLine(""); }
        }} />
    </div>
  );
}
