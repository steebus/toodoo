import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatDuration } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";

type Props = {
  task: FullTask;
  onSave: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// A native modal dialog: side sheet on desktop, bottom sheet under 820px (see pass.css).
// The dialog traps focus; on close focus goes back to whatever opened it.
export function EditSheet({ task, onSave, onDelete, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const [f, setF] = useState({
    title: task.title,
    description: task.description ?? "",
    note: task.note ?? "",
    link: task.link ?? "",
    due: task.due,
    time: task.time ?? "",
    priority: task.priority ?? "",
    estimate: task.estimate_mins ? formatDuration(task.estimate_mins) : "",
    tags: task.tags.join(", "),
  });
  const [invalid, setInvalid] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    const from = opener.current;
    return () => {
      if (d.open && typeof d.close === "function") d.close();
      if (from instanceof HTMLElement && from.isConnected) from.focus();
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) return setInvalid(true);
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
    if (Object.keys(patch).length) onSave(task.id, patch);
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
        <label className="sheet-field">
          <span>Title</span>
          <input value={f.title} onChange={set("title")} aria-invalid={invalid || undefined} autoComplete="off" autoFocus />
        </label>
        <label className="sheet-field">
          <span>Description</span>
          <textarea rows={3} value={f.description} onChange={set("description")} />
        </label>
        <label className="sheet-field">
          <span>Note</span>
          <textarea rows={2} value={f.note} onChange={set("note")} />
        </label>
        <label className="sheet-field">
          <span>Link</span>
          <input value={f.link} onChange={set("link")} autoComplete="off" inputMode="url" />
        </label>
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
          <label className="sheet-field">
            <span>Estimate</span>
            <input value={f.estimate} onChange={set("estimate")} autoComplete="off" />
          </label>
        </div>
        <label className="sheet-field">
          <span>Tags</span>
          <input value={f.tags} onChange={set("tags")} autoComplete="off" />
        </label>
        <div className="sheet-actions">
          <button type="button" className="sheet-delete" onClick={() => { onDelete(task.id); onClose(); }}>Delete</button>
          <span className="sheet-spacer" />
          <button type="button" className="sheet-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="sheet-save">Save</button>
        </div>
      </form>
    </dialog>
  );
}
