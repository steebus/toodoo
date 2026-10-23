import { useEffect, useRef, useState, type FormEvent } from "react";
import { EPIC_COLOURS, EPIC_STATUSES, EPIC_STATUS_LABEL, type Epic, type EpicColour } from "@shared/epics.ts";
import type { EpicFields } from "../lib/useWork";

type Props = {
  epic?: Epic; // none: a new epic
  colour?: EpicColour; // a new epic's, to start with
  offline?: boolean;
  onSave: (fields: EpicFields) => void;
  onDelete?: () => void;
  onClose: () => void;
};

// The edit sheet's twin for an epic: a native modal dialog, side sheet on desktop, bottom sheet on the phone.
export function EpicSheet({ epic, colour, offline = false, onSave, onDelete, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const [f, setF] = useState({
    title: epic?.title ?? "", description: epic?.description ?? "", priority: epic?.priority ?? "", status: epic?.status ?? "active",
    colour: epic?.colour ?? colour ?? "", repo: epic?.repo ?? "",
  });
  const [invalid, setInvalid] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    if (k === "title") setInvalid(false);
  };

  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    return () => {
      if (d.open && typeof d.close === "function") d.close();
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) return setInvalid(true);
    onSave({
      title, description: f.description.trim() || null,
      priority: (f.priority || null) as Epic["priority"], status: f.status as Epic["status"],
      colour: (f.colour || null) as Epic["colour"], repo: f.repo.trim() || null,
    });
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby="epic-sheet-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <form className="sheet-form" onSubmit={submit}>
        <h2 id="epic-sheet-title" className="sheet-title">{epic ? "Edit epic" : "New epic"}</h2>
        <div className="sheet-cell">
          <label className="sheet-field">
            <span>Title</span>
            <input value={f.title} onChange={set("title")} autoComplete="off" autoFocus maxLength={120}
              aria-invalid={invalid || undefined} aria-describedby={invalid ? "err-epic-title" : undefined} />
          </label>
          {invalid && <small id="err-epic-title" className="sheet-error">Needs a title</small>}
        </div>
        <label className="sheet-field">
          <span>Description</span>
          <textarea rows={4} value={f.description} onChange={set("description")} maxLength={2000} />
        </label>
        <label className="sheet-field">
          <span>Repo</span>
          <input value={f.repo} onChange={set("repo")} autoComplete="off" maxLength={200} placeholder="owner/name" />
        </label>
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
            <span>Status</span>
            <select value={f.status} onChange={set("status")}>
              {EPIC_STATUSES.map((s) => <option key={s} value={s}>{EPIC_STATUS_LABEL[s]}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="epic-swatches">
          <legend>Colour</legend>
          {EPIC_COLOURS.map((c) => (
            <label key={c} className="epic-swatch" style={{ ["--epic" as string]: `var(--epic-${c})` }}>
              <input type="radio" name="colour" value={c} checked={f.colour === c} onChange={set("colour")} aria-label={c} />
              <span aria-hidden />
            </label>
          ))}
        </fieldset>
        <div className="sheet-actions">
          {epic && onDelete && (
            <button type="button" className="sheet-delete" disabled={offline} onClick={() => { onDelete(); onClose(); }}>Delete</button>
          )}
          <span className="sheet-spacer" />
          <button type="button" className="sheet-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="sheet-save" disabled={offline}>Save</button>
        </div>
      </form>
    </dialog>
  );
}
