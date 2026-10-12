import { useState } from "react";
import { parseQuickAdd } from "@shared/quickadd.ts";
import { CalendarIcon, ClockIcon } from "./icons";

type Props = { today: string; nowM: number; initial?: string };

// Parses as you type and shows what it understood. Saving the line arrives with the add task.
export function QuickAdd({ today, nowM, initial = "" }: Props) {
  const [line, setLine] = useState(initial);
  const parsed = parseQuickAdd(line, today, nowM);
  return (
    <form className="quickadd" aria-label="Quick add" onSubmit={(e) => e.preventDefault()}>
      <input
        className="r-quickadd quickadd-input"
        name="line"
        aria-label="New to do"
        autoComplete="off"
        spellCheck={false}
        value={line}
        onChange={(e) => setLine(e.target.value)}
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
