import { useEffect, useRef, useState, type FormEvent } from "react";
import { EPIC_STATUS_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, type Epic } from "@shared/epics.ts";
import { formatDuration, parseDuration } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { normLink } from "@shared/validation.ts";

export type Draft = {
  title: string; description: string; note: string; link: string; due: string; time: string;
  priority: string; estimate: string; tags: string; epic: string; status: string;
};

type Props = {
  task: FullTask;
  epics?: Epic[];
  returnTo?: Element | null; // where focus goes on close, when what opened the sheet has gone (the ticket's Edit)
  draft?: Draft | null;
  offline?: boolean;
  onSave: (id: string, patch: Record<string, unknown>, draft: Draft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// A native modal dialog: side sheet on desktop, bottom sheet under 820px (see pass.css).
// The dialog traps focus; on close focus goes back to whatever opened it.
export function EditSheet({ task, epics = [], returnTo, draft, offline = false, onSave, onDelete, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(returnTo ?? document.activeElement);
  const restore = useRef<Element | null>(null);
  const [f, setF] = useState<Draft>(draft ?? {
    title: task.title,
    description: task.description ?? "",
    note: task.note ?? "",
    link: task.link ?? "",
    due: task.due,
    time: task.time ?? "",
    priority: task.priority ?? "",
    estimate: task.estimate_mins ? formatDuration(task.estimate_mins) : "",
    tags: task.tags.join(", "),
    epic: task.epic_id ?? "",
    status: task.status ?? "todo",
  });
  const [invalid, setInvalid] = useState<Partial<Record<"title" | "estimate" | "link", string>>>({});
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setInvalid((p) => ({ ...p, [k]: undefined }));
  };

  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    const from = () => restore.current ?? opener.current;
    return () => {
      if (d.open && typeof d.close === "function") d.close();
      const el = from();
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const title = f.title.trim();
    const bad: typeof invalid = {};
    if (!title) bad.title = "Needs a title";
    const est = f.estimate.trim();
    if (est) {
      const m = parseDuration(est);
      if (m == null || !Number.isFinite(m) || m < 1 || m > 1440) bad.estimate = "Like 45m or 1h 30m";
    }
    if (f.link.trim() && normLink(f.link) === undefined) bad.link = "Not a web address";
    if (bad.title || bad.estimate || bad.link) return setInvalid(bad);
    const patch: Record<string, unknown> = {};
    if (title !== task.title) patch.title = title;
    if (f.description.trim() !== (task.description ?? "")) patch.description = f.description.trim() || null;
    if (f.note.trim() !== (task.note ?? "")) patch.note = f.note.trim() || null;
    if (f.link.trim() !== (task.link ?? "")) patch.link = f.link.trim() || null;
    if (f.due && f.due !== task.due) patch.due = f.due;
    if (f.time !== (task.time ?? "")) patch.time = f.time || null;
    if (f.priority !== (task.priority ?? "")) patch.priority = f.priority || null;
    if (f.estimate.trim() !== (task.estimate_mins ? formatDuration(task.estimate_mins) : "")) patch.estimate_mins = f.estimate.trim() || null;
    const tags = f.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (!same(tags, task.tags)) patch.tags = tags;
    if (f.epic !== (task.epic_id ?? "")) patch.epic_id = f.epic || null;
    if (f.status !== (task.status ?? "todo")) patch.status = f.status;
    if (Object.keys(patch).length) onSave(task.id, patch, f);
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <form className="sheet-form" onSubmit={submit}>
        <h2 id="sheet-title" className="sheet-title">Edit</h2>
        <div className="sheet-cell">
          <label className="sheet-field">
            <span>Title</span>
            <input value={f.title} onChange={set("title")} aria-invalid={invalid.title ? true : undefined} aria-describedby={invalid.title ? "err-title" : undefined} autoComplete="off" autoFocus />
          </label>
          {invalid.title && <small id="err-title" className="sheet-error">{invalid.title}</small>}
        </div>
        <label className="sheet-field">
          <span>Description</span>
          <textarea rows={3} value={f.description} onChange={set("description")} />
        </label>
        <label className="sheet-field">
          <span>Note</span>
          <textarea rows={2} value={f.note} onChange={set("note")} />
        </label>
        <div className="sheet-cell">
          <label className="sheet-field">
            <span>Link</span>
            <input value={f.link} onChange={set("link")} autoComplete="off" inputMode="url" aria-invalid={invalid.link ? true : undefined} aria-describedby={invalid.link ? "err-link" : undefined} />
          </label>
          {invalid.link && <small id="err-link" className="sheet-error">{invalid.link}</small>}
        </div>
        <div className="sheet-pair">
          <label className="sheet-field">
            <span>Date</span>
            <input type="date" value={f.due} onChange={set("due")} />
          </label>
          <label className="sheet-field">
            <span>Time</span>
            <input type="time" value={f.time} onChange={set("time")} />
          </label>
        </div>
        <div className="sheet-pair">
          <label className="sheet-field">
            <span>Priority</span>
            <select value={f.priority} onChange={set("priority")}>
              <option value="">None</option>
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <div className="sheet-cell">
            <label className="sheet-field">
              <span>Estimate</span>
              <input value={f.estimate} onChange={set("estimate")} autoComplete="off" aria-invalid={invalid.estimate ? true : undefined} aria-describedby={invalid.estimate ? "err-est" : undefined} />
            </label>
            {invalid.estimate && <small id="err-est" className="sheet-error">{invalid.estimate}</small>}
          </div>
        </div>
        <label className="sheet-field">
          <span>Tags</span>
          <input value={f.tags} onChange={set("tags")} autoComplete="off" />
        </label>
        <div className="sheet-pair">
          <label className="sheet-field">
            <span>Epic</span>
            <select value={f.epic} onChange={set("epic")}>
              <option value="">None</option>
              {epics.filter((e) => e.status !== "done" || e.id === f.epic).map((e) => (
                <option key={e.id} value={e.id}>{e.status === "active" ? e.title : `${e.title} (${EPIC_STATUS_LABEL[e.status].toLowerCase()})`}</option>
              ))}
            </select>
          </label>
          <label className="sheet-field">
            <span>Status</span>
            <select value={f.status} onChange={set("status")}>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
            </select>
          </label>
        </div>
        <div className="sheet-actions">
          <button type="button" className="sheet-delete" disabled={offline} onClick={() => {
              restore.current = document.querySelector(".quickadd-input");
              onDelete(task.id);
              onClose();
            }}>Delete</button>
          <span className="sheet-spacer" />
          <button type="button" className="sheet-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="sheet-save" disabled={offline}>Save</button>
        </div>
      </form>
    </dialog>
  );
}
