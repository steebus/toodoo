import type { ReactNode } from "react";
import { NO_EPIC, NO_TAG, type GroupBy, type SortBy, type View } from "@shared/board.ts";
import { SlidersIcon } from "./icons";
import { usePopover } from "../lib/usePopover";

const GROUPS: [GroupBy, string][] = [["status", "Due"], ["column", "Status"], ["priority", "Priority"], ["epic", "Epic"], ["tag", "Tag"], ["source", "Source"]];
const SORTS: [SortBy, string][] = [["manual", "Manual"], ["due", "Due"], ["priority", "Priority"], ["time", "Time"], ["tag", "Tag"], ["effort", "Effort"]];

type Props = {
  view: View; tags: string[]; epics?: { id: string; title: string }[]; onChange: (v: View) => void;
};

// A sliders icon that opens a small panel of settings; Escape or a click away closes it (usePopover).
export function SettingsMenu({ label = "View", children }: { label?: string; children: ReactNode }) {
  const pop = usePopover();
  return (
    <div className="viewmenu" ref={pop.rootRef}>
      <button type="button" className="viewmenu-button" aria-label={label} title={label} aria-haspopup="dialog" {...pop.buttonProps}>
        <SlidersIcon />
      </button>
      {pop.shown && <div className="viewmenu-pop" role="dialog" aria-label={label} {...pop.panelProps}>{children}</div>}
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
      <SettingsPick label="Claude's" value={view.hideClaude ? "hide" : "show"} options={[["show", "Show"], ["hide", "Hide"]]}
        onChange={(v) => onChange({ ...view, hideClaude: v === "hide" })} />
      {epics.length > 0 && (
        <SettingsPick label="Epic" value={view.epic ?? ""} options={[["", "All"], ...epics.map((x): [string, string] => [x.id, x.title]), [NO_EPIC, "No epic"]]}
          onChange={(v) => onChange({ ...view, epic: v })} />
      )}
    </SettingsMenu>
  );
}
