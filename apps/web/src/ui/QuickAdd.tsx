import { useEffect, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import type { Epic } from "@shared/epics.ts";
import { addDays } from "@shared/planning.ts";
import { parseQuickAdd, QUICKADD_HINT } from "@shared/quickadd.ts";
import type { NewTask } from "../lib/useActions";
import { CalendarIcon, ClockIcon } from "./icons";

// Where the last line was filed from, so its docket can fly out of the input (see TodoPanel).
export const launch: { from: DOMRect | null; at: number } = { from: null, at: 0 };

type Props = {
  today: string; nowM: number; initial?: string; onAdd?: (t: NewTask, line: string) => Promise<boolean>; disabled?: boolean;
  epics?: Pick<Epic, "id" | "title" | "status" | "colour">[]; // for +epic
  tools?: boolean; // the phone's add sheet: a row of dials that write the grammar for you
  onExpand?: (line: string) => void; // a swipe up on the add area: carry what is typed to a full, blank ticket
  tags?: string[]; // tags in use: a #tag being typed offers the one it starts (Tab, → or a tap takes it)
};

// The phone's tool row: one dial per property. Press and drag it up or down to turn through its values (a tap
// turns one on); the first stop is "none". Each value is the word the grammar already knows.
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const TIMES = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm"];
type Dial = { kind: string; label: string; re: RegExp; stops: { word: string; label: string; colour?: string }[] };
const dials = (today: string, epics: Pick<Epic, "id" | "title" | "status" | "colour">[]): Dial[] => [
  { kind: "priority", label: "Priority", re: /^!/, stops: [["!high", "! High"], ["!med", "Med"], ["!low", "Low"]].map(([word, label]) => ({ word, label })) },
  {
    kind: "due", label: "Due", re: /^(today|tomorrow|tmrw|sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i,
    stops: [{ word: "today", label: "Today" }, { word: "tomorrow", label: "Tmrw" },
      ...[2, 3, 4, 5, 6].map((n) => {
        const w = DAYS[new Date(addDays(today, n) + "T12:00:00Z").getUTCDay()];
        return { word: w, label: w[0].toUpperCase() + w.slice(1) };
      })],
  },
  { kind: "time", label: "Time", re: /^\d{1,2}(?::\d{2})?(?:am|pm)$/i, stops: TIMES.map((t) => ({ word: t, label: t })) },
  {
    kind: "epic", label: "Epic", re: EPIC,
    stops: epics.filter((e) => e.status === "active").map((e) => ({ word: epicWord(e.title), label: e.title, colour: e.colour ?? "slate" })),
  },
  { kind: "estimate", label: "Estimate", re: /^~/, stops: ["~15m", "~30m", "~45m", "~1h", "~2h"].map((w) => ({ word: w, label: w.slice(1) })) },
].filter((d) => d.stops.length);
const EPIC = /^\+/;
const epicWord = (title: string) => "+" + title.toLowerCase().trim().replace(/\s+/g, "-");
const STEP_PX = 26; // a drag this far turns the dial one stop

// The line with its word of this kind swapped for another (null: taken out).
export function setWord(line: string, re: RegExp, word: string | null): string {
  const rest = line.trim().split(/\s+/).filter(Boolean).filter((w) => !re.test(w));
  return [...rest, ...(word ? [word] : [])].join(" ") + (word ? " " : "");
}

// The line with word toggled in its kind: the same word comes out; another of its kind is swapped for it.
export function toggleWord(line: string, word: string, re: RegExp): string {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const had = words.some((w) => w.toLowerCase() === word);
  const rest = words.filter((w) => !re.test(w));
  return [...rest, ...(had ? [] : [word])].join(" ") + (had ? "" : " ");
}

// -1 is "none", then each stop, round again.
const turn = (from: number, by: number, n: number) => ((((from + 1 + by) % (n + 1)) + (n + 1)) % (n + 1)) - 1;

function DialButton({ dial, at, typed, disabled, onTurn }: { dial: Dial; at: number; typed?: string; disabled?: boolean; onTurn: (i: number) => void }) {
  const drag = useRef<{ y: number; from: number; turned: boolean } | null>(null);
  const stop = at >= 0 ? dial.stops[at] : undefined;
  const set = typed !== undefined;
  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    drag.current = { y: e.clientY, from: at, turned: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault(); // keep the keyboard up
  };
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const by = Math.round((d.y - e.clientY) / STEP_PX); // up turns on to the next
    if (!by && !d.turned) return;
    const to = turn(d.from, by, dial.stops.length);
    if (to !== at || !d.turned) { d.turned = true; onTurn(to); }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.turned) onTurn(turn(at, 1, dial.stops.length)); // a tap: the next stop
  };
  return (
    <button type="button" className="qa-tool qa-dial" disabled={disabled} aria-pressed={set} data-kind={dial.kind}
      aria-label={`${dial.label}${set ? `: ${stop?.label ?? typed}` : ""}. Drag up or down to change`}
      onClick={(e) => e.detail === 0 && onTurn(turn(at, 1, dial.stops.length))} // a key press (a pointer's tap is handled on release)
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onTurn(turn(at, e.key === "ArrowUp" ? 1 : -1, dial.stops.length)); }
      }}>
      {stop?.colour && <span className="chip-epic" aria-hidden style={{ ["--epic" as string]: `var(--epic-${stop.colour})` }} />}
      <span className="qa-dial-val">{set ? stop?.label ?? typed : dial.label}</span>
      <span className="qa-dial-grip" aria-hidden>⇅</span>
    </button>
  );
}

// Parses as you type and shows what it understood. Enter files it; a line with no title is not filed.
export function QuickAdd({ today, nowM, initial = "", onAdd, disabled, epics = [], tools = false, tags = [], onExpand }: Props) {
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

  const swipe = useRef<{ x: number; y: number } | null>(null);
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
    <form className="quickadd" aria-label="Quick add" onSubmit={submit}
      onTouchStart={onExpand && ((e) => { swipe.current = e.touches.length === 1 && !(e.target as Element).closest(".qa-tool") ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; })}
      onTouchEnd={onExpand && ((e) => {
        const s = swipe.current;
        swipe.current = null;
        const p = e.changedTouches[0];
        if (s && s.y - p.clientY > 50 && s.y - p.clientY > Math.abs(p.clientX - s.x) * 1.5) onExpand(line);
      })}>
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
          {dials(today, epics).map((d) => {
            const word = line.trim().split(/\s+/).find((x) => d.re.test(x));
            const at = word ? d.stops.findIndex((x) => x.word === word.toLowerCase()) : -1;
            return (
              <DialButton key={d.kind} dial={d} at={at} typed={word} disabled={disabled}
                onTurn={(i) => { setLine((l) => setWord(l, d.re, i < 0 ? null : d.stops[i].word)); setInvalid(false); }} />
            );
          })}
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
