import { useEffect, useRef } from "react";
import { effectivePriority, EPIC_STATUS_LABEL, TASK_STATUS_LABEL, TASK_STATUSES, type Epic, type TaskStatus } from "@shared/epics.ts";
import { dayWord, fmtTime, formatDuration } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { waitingDays } from "@shared/board.ts";
import { shortDate } from "./format";
import { CloseIcon, PenProgress, PenTick } from "./icons";

export type TaskViewActions = {
  onTick?: (done: boolean) => void;
  onPlan?: () => void; // put it on the day's line
  onTomorrow?: () => void;
  onStatus?: (s: TaskStatus) => void; // the Board's columns
  onEdit: () => void;
  onDelete?: () => void;
};

type Props = TaskViewActions & {
  task: FullTask;
  epic?: Epic;
  today: string;
  progress?: { spent: number; est: number } | null;
  offline?: boolean;
  onClose: () => void;
};

const DASH = "-".repeat(80);

// A task, read: the docket blown up into a side sheet of thermal paper, with what you can do to it along the foot.
// A native modal dialog like the edit sheet: side sheet on desktop, bottom sheet on the phone.
export function TaskView({ task: t, epic, today, progress, offline = false, onClose, onTick, onPlan, onTomorrow, onStatus, onEdit, onDelete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    d.querySelector<HTMLElement>(".tk-close")?.focus(); // as showModal would; keys (Esc, e) work at once
    return () => {
      if (d.open && typeof d.close === "function") d.close();
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  const high = !t.done && effectivePriority(t, epic) === "high";
  const late = !t.done && t.due < today;
  const n = late ? waitingDays(t.due, today) : 0;
  const when = t.done
    ? `DONE ${t.done_on ? dayWord(t.done_on, today).toUpperCase() : ""}`.trim()
    : late ? `${n} ${n === 1 ? "DAY" : "DAYS"} OVER` : t.due === today || dayWord(t.due, today) === "tomorrow" ? dayWord(t.due, today).toUpperCase() : shortDate(t.due);
  const act = (fn?: () => void) => fn && (() => { fn(); onClose(); });

  return (
    <dialog
      ref={dialog}
      className="sheet sheet-ticket"
      aria-labelledby="ticket-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); onClose(); }
        else if (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); onEdit(); }
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <article className={`ticket${t.done ? " is-done" : ""}${high ? " is-high" : ""}`}
        style={epic?.colour ? { ["--epic" as string]: `var(--epic-${epic.colour})` } : undefined}>
        <button type="button" className="tk-close" aria-label="Close" onClick={onClose}><CloseIcon size={18} /></button>
        <p className="tk-head">
          <span className={late ? "tk-late" : undefined}>{when}</span>
          <span>{[t.time ? fmtTime(t.time).toUpperCase() : "", t.estimate_mins ? `~${formatDuration(t.estimate_mins)}` : ""].filter(Boolean).join("  ")}</span>
        </p>
        <p className="tk-dashes" aria-hidden>{DASH}</p>
        <div className="tk-title-row">
          <h2 id="ticket-title" className="tk-title"><span className="tk-title-text">{t.title.toUpperCase()}</span></h2>
          {t.done && <PenTick on draw className="tk-tick" />}
        </div>
        <p className="tk-flags">
          {high && <span className="tk-high">! HIGH</span>}
          {!onStatus && !t.done && t.status && t.status !== "todo" && <span>{TASK_STATUS_LABEL[t.status].toUpperCase()}</span>}
          {t.source !== "you" && <span>{t.source.toUpperCase()} {(t.external_id ?? "").replace(/^\w+:/, "")}</span>}
        </p>
        {epic && (
          <p className="tk-epic">
            <span className="tk-epic-dot" aria-hidden />
            {epic.title.toUpperCase()}
            {epic.status !== "active" && <span className="tk-epic-status"> · {EPIC_STATUS_LABEL[epic.status].toUpperCase()}</span>}
          </p>
        )}
        {progress && (
          <div className="tk-progress">
            <PenProgress {...progress} />
            <span>{formatDuration(progress.spent)} of {formatDuration(progress.est)}</span>
          </div>
        )}
        {(t.description || t.note || t.link || t.tags.length > 0) && <p className="tk-dashes" aria-hidden>{DASH}</p>}
        {t.description && <p className="tk-body">{t.description}</p>}
        {t.note && <p className="tk-note">{t.note}</p>}
        {t.link && <p className="tk-link"><a href={t.link} target="_blank" rel="noreferrer">{t.link.replace(/^https?:\/\//, "")}</a></p>}
        {t.tags.length > 0 && <p className="tk-tags">{t.tags.map((x) => `#${x}`).join("  ")}</p>}
        <p className="tk-dashes" aria-hidden>{DASH}</p>
        {onStatus && !t.done && (
          <div className="tk-status" role="group" aria-label="Column">
            {TASK_STATUSES.map((s) => (
              <button key={s} type="button" className="tk-chip" aria-pressed={(t.status ?? "todo") === s} disabled={offline}
                onClick={() => onStatus(s)}>{TASK_STATUS_LABEL[s]}</button>
            ))}
          </div>
        )}
        <div className="tk-actions">
          {onTick && (
            <button type="button" className="tk-act tk-primary" disabled={offline} onClick={act(() => onTick(!t.done))}>
              {t.done ? "Reopen" : "Done"}
            </button>
          )}
          {onPlan && !t.done && <button type="button" className="tk-act" disabled={offline} onClick={act(onPlan)}>Plan it</button>}
          {onTomorrow && !t.done && t.due <= today && <button type="button" className="tk-act" disabled={offline} onClick={act(onTomorrow)}>Tomorrow</button>}
          <button type="button" className="tk-act" onClick={onEdit}>Edit</button>
          {onDelete && <button type="button" className="tk-act tk-delete" disabled={offline} onClick={act(onDelete)}>Delete</button>}
        </div>
      </article>
    </dialog>
  );
}
