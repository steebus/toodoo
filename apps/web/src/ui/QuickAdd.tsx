import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Epic } from "@shared/epics.ts";
import { parseQuickAdd, QUICKADD_HINT } from "@shared/quickadd.ts";
import type { NewTask } from "../lib/useActions";
import { CalendarIcon, ClockIcon } from "./icons";

// Where the last line was filed from, so its docket can fly out of the input (see TodoPanel).
export const launch: { from: DOMRect | null; at: number } = { from: null, at: 0 };

type Props = {
  today: string; nowM: number; initial?: string; onAdd?: (t: NewTask, line: string) => Promise<boolean>; disabled?: boolean;
  epics?: Pick<Epic, "id" | "title" | "status" | "colour">[]; // for +epic
  tools?: boolean; // the phone's add sheet: a row of buttons that write the grammar for you
  tags?: string[]; // tags in use: a #tag being typed offers the one it starts (Tab, → or a tap takes it)
};

// The tool row's buttons, each the word it writes; one per kind (a second in the same kind swaps it in).
const KINDS: { kind: string; re: RegExp; words: [string, string][] }[] = [
  { kind: "when", re: /^(today|tomorrow|tmrw)$/i, words: [["today", "Today"], ["tomorrow", "Tmrw"]] },
  { kind: "priority", re: /^!/, words: [["!high", "! High"], ["!med", "Med"], ["!low", "Low"]] },
  { kind: "estimate", re: /^~/, words: [["~15m", "15m"], ["~30m", "30m"], ["~1h", "1h"]] },
];
const EPIC = /^\+/;
const epicWord = (title: string) => "+" + title.toLowerCase().trim().replace(/\s+/g, "-");

// The line with word toggled in its kind: the same word comes out; another of its kind is swapped for it.
export function toggleWord(line: string, word: string, re: RegExp): string {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const had = words.some((w) => w.toLowerCase() === word);
  const rest = words.filter((w) => !re.test(w));
  return [...rest, ...(had ? [] : [word])].join(" ") + (had ? "" : " ");
}

// Parses as you type and shows what it understood. Enter files it; a line with no title is not filed.
export function QuickAdd({ today, nowM, initial = "", onAdd, disabled, epics = [], tools = false, tags = [] }: Props) {
  const [line, setLine] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const parsed = parseQuickAdd(line, today, nowM, epics);
  const input = useRef<HTMLInputElement>(null);
  const [fed, setFed] = useState(0);
  const typing = /(?:^|\s)#(\S+)$/.exec(line)?.[1].toLowerCase();
  const offer = typing ? tags.find((t) => t.startsWith(typing) && t !== typing) : undefined;
  const takeOffer = () => {
    setLine((l) => l.replace(/#\S*$/, `#${offer} `));
    input.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!line.trim()) return setInvalid(true);
    if (!parsed.title.trim()) return setInvalid(true);
    const typed = line;
    if (input.current) Object.assign(launch, { from: input.current.getBoundingClientRect(), at: Date.now() });
    setFed((n) => n + 1); // the printer feeds a slip out of the slot
    setLine("");
    setInvalid(false);
    void onAdd?.({
      title: parsed.title, due: parsed.due, time: parsed.time, priority: parsed.priority,
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
        onKeyDown={(e) => {
          const atEnd = e.currentTarget.selectionStart === line.length;
          if (offer && atEnd && (e.key === "Tab" || e.key === "ArrowRight") && !e.shiftKey) {
            e.preventDefault();
            takeOffer();
          }
        }}
      />
      <button type="submit" className="r-add-button add-button" disabled={disabled}>Add</button>
      {fed > 0 && <span key={fed} className="qa-feed" aria-hidden />}
      {tools && (
        <div className="qa-tools" role="group" aria-label="Add details">
          {[...KINDS.flatMap((k) => k.words.map(([w, label]) => ({ w, label, re: k.re, colour: undefined as string | undefined }))),
            ...epics.filter((e) => e.status === "active").map((e) => ({ w: epicWord(e.title), label: e.title, re: EPIC, colour: e.colour ?? "slate" }))]
            .map(({ w, label, re, colour }) => (
              <button key={w} type="button" className="qa-tool" disabled={disabled}
                aria-pressed={line.trim().split(/\s+/).some((x) => x.toLowerCase() === w)}
                onPointerDown={(e) => e.preventDefault()} // keep the keyboard up
                onClick={() => { setLine((l) => toggleWord(l, w, re)); setInvalid(false); input.current?.focus(); }}>
                {colour && <span className="chip-epic" aria-hidden style={{ ["--epic" as string]: `var(--epic-${colour})` }} />}
                {label}
              </button>
            ))}
        </div>
      )}
      <ParsedChips parsed={parsed} epics={epics} className="r-chips chips">
        {offer && (
          <li className="chip chip-offer">
            <button type="button" aria-label={`Use tag ${offer}`} onPointerDown={(e) => e.preventDefault()} onClick={takeOffer}>
              #{offer}<kbd aria-hidden>⇥</kbd>
            </button>
          </li>
        )}
      </ParsedChips>
    </form>
  );
}

// What a line parsed into, as chips. Every add line shows them (the Day's, the Board's, an epic's).
export function ParsedChips({ parsed, epics = [], className = "chips", children }: {
  parsed: ReturnType<typeof parseQuickAdd>; epics?: Pick<Epic, "id" | "colour">[]; className?: string; children?: ReactNode;
}) {
  // Chips pop in (CSS) as they are understood; the ones there at first paint just sit there.
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
  }, []);
  return (
    <ul className={className} aria-label="Parsed">
      {children}
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
  );
}
