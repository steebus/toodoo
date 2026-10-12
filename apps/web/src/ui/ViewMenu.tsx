import { useEffect, useRef, useState } from "react";
import { NO_TAG, type GroupBy, type SortBy, type View } from "@shared/board.ts";
import { ChevronIcon } from "./icons";

const GROUPS: [GroupBy, string][] = [["status", "Status"], ["due", "Due"], ["priority", "Priority"], ["tag", "Tag"], ["source", "Source"]];
const SORTS: [SortBy, string][] = [["manual", "Manual"], ["due", "Due"], ["priority", "Priority"], ["time", "Time"], ["tag", "Tag"]];

type Props = { view: View; tags: string[]; onChange: (v: View) => void; onSignOut?: () => void };

// One quiet control: group, sort and tag filter live in its popover.
export function ViewMenu({ view, tags, onChange, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="viewmenu" ref={root}>
      <button type="button" className="viewmenu-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        View
        <ChevronIcon size={16} className={`viewmenu-chevron${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="viewmenu-pop" role="dialog" aria-label="View">
          <label className="viewmenu-field">
            Group
            <select value={view.group} onChange={(e) => onChange({ ...view, group: e.target.value as GroupBy })}>
              {GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="viewmenu-field">
            Sort
            <select value={view.sort} onChange={(e) => onChange({ ...view, sort: e.target.value as SortBy })}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="viewmenu-field">
            Tag
            <select value={view.tag} onChange={(e) => onChange({ ...view, tag: e.target.value })}>
              <option value="">All</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value={NO_TAG}>Untagged</option>
            </select>
          </label>
          {onSignOut && <button type="button" className="viewmenu-out" onClick={onSignOut}>Sign out</button>}
        </div>
      )}
    </div>
  );
}
