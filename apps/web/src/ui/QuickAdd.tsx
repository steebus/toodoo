import { useState, type FormEvent } from "react";
import { parseQuickAdd } from "@shared/quickadd.ts";
import type { NewTask } from "../lib/useActions";
import { CalendarIcon, ClockIcon } from "./icons";

type Props = { today: string; nowM: number; initial?: string; onAdd?: (t: NewTask) => Promise<boolean> };

// Parses as you type and shows what it understood. Enter files it; a line with no title is not filed.
export function QuickAdd({ today, nowM, initial = "", onAdd }: Props) {
  const [line, setLine] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const parsed = parseQuickAdd(line, today, nowM);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!line.trim()) return setInvalid(true);
    if (!parsed.title.trim()) return setInvalid(true);
    const typed = line;
    setLine("");
    setInvalid(false);
    void onAdd?.({
      title: parsed.title, due: parsed.due ?? today, time: parsed.time, priority: parsed.priority,
      tags: parsed.tags, estimate_mins: parsed.estimate_mins, source: "you",
    }).then((ok) => ok || setLine((cur) => cur || typed));
  };

  return (
    <form className="quickadd" aria-label="Quick add" onSubmit={submit}>
      <input
        className="r-quickadd quickadd-input"
        name="line"
        aria-label="New to do"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        value={line}
        onChange={(e) => {
          setLine(e.target.value);
          setInvalid(false);
        }}
      />
      <button type="submit" className="r-add-button add-button">Add</button>
      <ul className="r-chips chips" aria-label="Parsed">
        {parsed.chips.map((c, i) => {
          const high = c.kind === "priority" && parsed.priority === "high";
          return (
            <li key={`${c.kind}-${i}`} className={`chip${high ? " chip-high" : ""}`}>
              {c.kind === "date" && <CalendarIcon className="chip-icon" />}
              {(c.kind === "time" || c.kind === "estimate") && <ClockIcon className="chip-icon" />}
              {c.kind === "priority" && <span className="chip-bang" aria-hidden>!</span>}
              {c.kind === "priority" ? c.text.replace(/^!/, "") || "high" : c.text}
            </li>
          );
        })}
      </ul>
    </form>
  );
}
