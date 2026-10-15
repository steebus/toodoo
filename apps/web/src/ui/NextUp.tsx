import { useEffect, useRef, useState, type ReactNode } from "react";
import { addDays, dayWord } from "@shared/planning.ts";
import type { AutoPlanOptions } from "../lib/useActions";
import { ChevronIcon } from "./icons";
import type { NextUpItem } from "./types";

type Props = {
  items: NextUpItem[]; onOpen?: (id: string) => void; open?: boolean; onToggle?: () => void;
  // Auto plan: the day shown is the default, today the first of the days on offer.
  autoPlan?: { date: string; today: string; run: (o: AutoPlanOptions) => void; replan: (o: AutoPlanOptions) => void };
  preview?: ReactNode; // while an auto plan is shown on the line, its Accept bar stands in for the list
};

// At the head of the Day plan: the top three to pick from, and Auto plan to fill the day. Its label folds it.
export function NextUp({ items, onOpen, open = true, onToggle, autoPlan, preview }: Props) {
  return (
    <section className={`nextup${open ? "" : " is-folded"}`} aria-labelledby="nextup-label">
      <header className="nextup-head">
        <h3 id="nextup-label" className="section-label">
          <button type="button" className="nextup-toggle" aria-expanded={open} onClick={onToggle} disabled={!onToggle}>
            NEXT UP
            <ChevronIcon size={16} className={`nextup-chevron${open ? " is-open" : ""}`} />
          </button>
        </h3>
        <AutoPlan {...autoPlan} />
      </header>
      {preview}
      {open && !preview && <ol className="nextup-list">
        {items.slice(0, 3).map((it) => (
          <li key={it.id} className="nextup-item">
            <button type="button" className="nextup-title" onClick={() => onOpen?.(it.id)}>{it.title}</button>
            <p className="nextup-why">
              {it.when}
              {it.why && (
                <>
                  <span className="sep" aria-hidden>·</span>
                  {it.why}
                </>
              )}
            </p>
          </li>
        ))}
      </ol>}
    </section>
  );
}

// How far Next up pushes the line down (pass.css): its frame plus a line per item (none folded), and a gap.
export const nextUpHeight = (n: number, open = true, shown = n > 0) =>
  (shown ? `calc(${(open && n ? 46 + Math.min(n, 3) * 27 : 40)} * var(--u) + 1.6cqh)` : "0cqh");

// The day's window, its breathing room and whether blocks already on the line stay: kept in this browser, so a click
// plans the usual way.
type Prefs = Omit<AutoPlanOptions, "date" | "seed">;
const KEY = "toodoo.autoPlan";
const FRESH: Prefs = { from: "09:00", until: "17:00", keep: true, lunch: true, buffer: 10, slack: true };
const BUFFERS = [0, 5, 10, 15];
function loadPrefs(): Prefs {
  try {
    const p = { ...FRESH, ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null) };
    return /^\d\d:\d\d$/.test(p.from) && /^\d\d:\d\d$/.test(p.until) && BUFFERS.includes(p.buffer) ? p : FRESH;
  } catch {
    return FRESH;
  }
}

// Auto plan: the button plans the day shown with the saved settings (shown on the line first, to accept); its arrow
// opens them: the window, the day, keep what's planned, lunch, the buffer after meetings, slack, and Replan from now.
function AutoPlan({ date, today, run, replan }: Partial<NonNullable<Props["autoPlan"]>>) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [menu, setMenu] = useState(false);
  const [day, setDay] = useState(date ?? today ?? "");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => setDay(date ?? ""), [date]);
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const set = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* holds for this visit */ }
  };
  const go = (d: string) => { setMenu(false); run?.({ date: d, ...prefs }); };
  const days = today ? Array.from({ length: 7 }, (_, i) => addDays(today, i)) : [];
  const bad = prefs.until <= prefs.from;
  return (
    <div className="autoplan" ref={root}>
      <button type="button" className="plan-all" disabled={!run || !date || bad} onClick={() => go(date!)}>Auto plan</button>
      <button type="button" className="autoplan-more" aria-label="Auto plan options" aria-expanded={menu} disabled={!run} onClick={() => setMenu((x) => !x)}>
        <ChevronIcon size={14} className={`nextup-chevron${menu ? " is-open" : ""}`} />
      </button>
      {menu && (
        <div className="autoplan-menu" role="dialog" aria-label="Auto plan options">
          <div className="autoplan-row">
            <label>From <input type="time" step={300} value={prefs.from} onChange={(e) => e.target.value && set({ from: e.target.value })} /></label>
            <label>To <input type="time" step={300} value={prefs.until} onChange={(e) => e.target.value && set({ until: e.target.value })} /></label>
          </div>
          <label className="autoplan-row">Day
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {days.map((d) => <option key={d} value={d}>{dayWord(d, today!).replace(/^./, (c) => c.toUpperCase())}</option>)}
            </select>
          </label>
          <label className="autoplan-row autoplan-keep">
            <input type="checkbox" checked={prefs.keep} onChange={(e) => set({ keep: e.target.checked })} />
            Keep what's already planned
          </label>
          <label className="autoplan-row autoplan-keep">
            <input type="checkbox" checked={prefs.lunch} onChange={(e) => set({ lunch: e.target.checked })} />
            Keep lunch free (12–1)
          </label>
          <label className="autoplan-row">After meetings
            <select value={prefs.buffer} onChange={(e) => set({ buffer: Number(e.target.value) })}>
              {BUFFERS.map((b) => <option key={b} value={b}>{b ? `${b} minutes free` : "no gap"}</option>)}
            </select>
          </label>
          <label className="autoplan-row autoplan-keep" title="Fill only as much of the day as your past plans say gets done">
            <input type="checkbox" checked={prefs.slack} onChange={(e) => set({ slack: e.target.checked })} />
            Leave slack, from how my days go
          </label>
          {bad && <p className="autoplan-bad" role="alert">The day has to end after it starts</p>}
          <div className="autoplan-row">
            <button type="button" className="autoplan-go" disabled={bad || !day} onClick={() => go(day)}>Plan {dayWord(day || today!, today!)}</button>
          </div>
          {day === today && (
            <button type="button" className="autoplan-replan" disabled={bad} onClick={() => { setMenu(false); replan?.({ date: today!, ...prefs }); }}>
              Replan from now
              <span>Missed blocks off, the rest of today refilled, what won't fit onto tomorrow</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
