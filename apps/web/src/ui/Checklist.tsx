import { useState, type KeyboardEvent } from "react";
import type { ChecklistItem } from "@shared/snapshot.ts";
import { CloseIcon, PenTick } from "./icons";

type Props = {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  disabled?: boolean;
  editing?: boolean; // the edit sheet: steps can be retyped and removed; the ticket only ticks and adds
  label?: string;
};

// A task's steps: pen boxes that tick, and a line at the foot to add one (Enter). On the ticket it is paper;
// in the edit sheet each step can also be retyped or crossed out.
export function Checklist({ items, onChange, disabled, editing = false, label = "Checklist" }: Props) {
  const [line, setLine] = useState("");
  const set = (i: number, patch: Partial<ChecklistItem>) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const add = () => {
    const text = line.trim();
    if (!text) return;
    onChange([...items, { text: text.slice(0, 200), done: false }]);
    setLine("");
  };
  const enter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // inside the edit sheet's form: add a step, don't save the task
    add();
  };
  const done = items.filter((x) => x.done).length;
  return (
    <div className={`checklist${editing ? " is-editing" : ""}`} role="group" aria-label={label}>
      {items.length > 0 && <p className="cl-count">{done}/{items.length}</p>}
      <ul className="cl-items">
        {items.map((x, i) => (
          <li key={i} className={`cl-item${x.done ? " is-done" : ""}`}>
            <button type="button" className="cl-box" role="checkbox" aria-checked={x.done} aria-label={x.text} disabled={disabled}
              onClick={() => set(i, { done: !x.done })}>
              <PenTick on={x.done} draw className="cl-tick" size={22} />
            </button>
            {editing ? (
              <input className="cl-text" value={x.text} maxLength={200} aria-label={`Step ${i + 1}`} disabled={disabled}
                onChange={(e) => set(i, { text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
            ) : (
              <span className="cl-text"><span className="cl-text-ink">{x.text}</span></span>
            )}
            {editing && (
              <button type="button" className="cl-x" aria-label={`Remove ${x.text || `step ${i + 1}`}`} disabled={disabled}
                onClick={() => onChange(items.filter((_, k) => k !== i))}>
                <CloseIcon size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {items.length < 50 && (
        <input className="cl-add" value={line} placeholder="+ Add a step" aria-label="Add a step" maxLength={200} disabled={disabled}
          onChange={(e) => setLine(e.target.value)} onKeyDown={enter} onBlur={add} />
      )}
    </div>
  );
}
