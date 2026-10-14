import { useEffect, useRef, useState, type ReactNode } from "react";
import { NO_EPIC, NO_TAG, type GroupBy, type SortBy, type View } from "@shared/board.ts";
import { SlidersIcon } from "./icons";

const GROUPS: [GroupBy, string][] = [["status", "Due"], ["column", "Status"], ["priority", "Priority"], ["epic", "Epic"], ["tag", "Tag"], ["source", "Source"]];
const SORTS: [SortBy, string][] = [["manual", "Manual"], ["due", "Due"], ["priority", "Priority"], ["time", "Time"], ["tag", "Tag"], ["effort", "Effort"]];

type Props = {
  view: View; tags: string[]; epics?: { id: string; title: string }[]; onChange: (v: View) => void;
};

// A sliders icon that opens a small panel of settings; Escape or a click away closes it.
export function SettingsMenu({ label = "View", children }: { label?: string; children: ReactNode }) {
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
      <button type="button" className="viewmenu-button" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <SlidersIcon />
      </button>
      {open && <div className="viewmenu-pop" role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

// A labelled select in a settings panel.
export function SettingsPick({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="viewmenu-field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// The Day's To do: group, sort and the tag and epic filters.
export function ViewMenu({ view, tags, epics = [], onChange }: Props) {
  return (
    <SettingsMenu>
      <SettingsPick label="Group" value={view.group} options={GROUPS} onChange={(v) => onChange({ ...view, group: v as GroupBy })} />
      <SettingsPick label="Sort" value={view.sort} options={SORTS} onChange={(v) => onChange({ ...view, sort: v as SortBy })} />
      <SettingsPick label="Tag" value={view.tag} options={[["", "All"], ...tags.map((t): [string, string] => [t, t]), [NO_TAG, "Untagged"]]}
        onChange={(v) => onChange({ ...view, tag: v })} />
      {epics.length > 0 && (
        <SettingsPick label="Epic" value={view.epic ?? ""} options={[["", "All"], ...epics.map((x): [string, string] => [x.id, x.title]), [NO_EPIC, "No epic"]]}
          onChange={(v) => onChange({ ...view, epic: v })} />
      )}
    </SettingsMenu>
  );
}
