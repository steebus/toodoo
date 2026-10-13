import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Epic } from "@shared/epics.ts";
import { parseQuickAdd, QUICKADD_HINT } from "@shared/quickadd.ts";
import type { NewTask } from "../lib/useActions";
import { CalendarIcon, ClockIcon } from "./icons";

// Where the last line was filed from, so its docket can fly out of the input (see TodoPanel).
export const launch: { from: DOMRect | null; at: number } = { from: null, at: 0 };

type Props = {
  today: string; nowM: number; initial?: string; onAdd?: (t: NewTask, line: string) => Promise<boolean>; disabled?: boolean;
  epics?: Pick<Epic, "id" | "title" | "status" | "colour">[]; // for +epic
};

// Parses as you type and shows what it understood. Enter files it; a line with no title is not filed.
export function QuickAdd({ today, nowM, initial = "", onAdd, disabled, epics = [] }: Props) {
  const [line, setLine] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const parsed = parseQuickAdd(line, today, nowM, epics);
  const input = useRef<HTMLInputElement>(null);
  // Chips pop in (CSS) as they are understood; the ones there at first paint just sit there.
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!line.trim()) return setInvalid(true);
    if (!parsed.title.trim()) return setInvalid(true);
    const typed = line;
    if (input.current) Object.assign(launch, { from: input.current.getBoundingClientRect(), at: Date.now() });
    setLine("");
    setInvalid(false);
    void onAdd?.({
      title: parsed.title, due: parsed.due ?? today, time: parsed.time, priority: parsed.priority,
      tags: parsed.tags, estimate_mins: parsed.estimate_mins, source: "you", ...(parsed.epic_id ? { epic_id: parsed.epic_id } : null),
    }, typed).then((ok) => ok || setLine((cur) => cur || typed));
  };

  return (
    <form className="quickadd" aria-label="Quick add" onSubmit={submit}>
      <input
        ref={input}
        className="r-quickadd quickadd-input"
        name="line"
        disabled={disabled}
        aria-label="New to do"
        placeholder={QUICKADD_HINT}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        value={line}
        onChange={(e) => {
          setLine(e.target.value);
          setInvalid(false);
        }}
      />
      <button type="submit" className="r-add-button add-button" disabled={disabled}>Add</button>
      <ul className="r-chips chips" aria-label="Parsed">
        {parsed.chips.map((c, i) => {
          const high = c.kind === "priority" && parsed.priority === "high";
          return (
            <li key={`${c.kind}-${i}`} className={`chip${high ? " chip-high" : ""}${live.current ? " chip-pop" : ""}`}>
              {c.kind === "date" && <CalendarIcon className="chip-icon" />}
              {(c.kind === "time" || c.kind === "estimate") && <ClockIcon className="chip-icon" />}
              {c.kind === "priority" && <span className="chip-bang" aria-hidden>!</span>}
              {c.kind === "epic" && (
                <span className="chip-epic" aria-hidden
                  style={{ ["--epic" as string]: `var(--epic-${epics.find((e) => e.id === parsed.epic_id)?.colour ?? "slate"})` }} />
              )}
              {c.kind === "priority" ? c.text.replace(/^!/, "") || "high" : c.text}
            </li>
          );
        })}
      </ul>
    </form>
  );
}
