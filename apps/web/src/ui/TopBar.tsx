import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useFitText } from "../lib/useFitText";
import { go, type Room } from "../lib/useRoute";
import { CheckIcon, ChevronIcon, TimerIcon } from "./icons";
import { RoomNav } from "./RoomNav";
import { ThemeCycle } from "./ThemeSwitch";

type Props = {
  date: string; headline: string; total: number; presets: string[]; activePreset: string; onPreset?: (p: string) => void;
  celebrate?: boolean; offline?: boolean; unsaved?: boolean;
  room?: Room; // the room nav, and which room is lit; none in the fixture
  onFocus?: () => void; // Focus on the task in hand; missing when there is nothing on the line now or next
  onSignOut?: () => void;
};

// The one header row, the same in every room: wordmark and rooms, the date (its chevron opens the day menu:
// theme, share, sign out) over the day's line, Focus, and the Plan · Capture presets.
export function TopBar({ date, headline, total, presets, activePreset, onPreset, onFocus, onSignOut, celebrate = false, offline = false, unsaved = false, room }: Props) {
  const line = useRef<HTMLParagraphElement>(null);
  useFitText(line, headline, 0.6);
  return (
    <header className="topbar">
      <p className="r-wordmark wordmark">toodoo</p>
      {room && <RoomNav room={room} />}
      {offline && <span className="offline-stamp" role="status">{unsaved ? "unsaved" : "offline"}</span>}
      <h1 className="r-date date">
        {room ? <DayMenu date={date} onSignOut={onSignOut} /> : date}
      </h1>
      {/* The hero line: the one thing that moves on first paint (CSS, so it never waits on script). */}
      <p ref={line} className="r-headline headline" title={headline || undefined}>
        <span key={headline} className="headline-line">{headline}</span>
      </p>
      <p className="r-progress focus-slot">
        <button type="button" className="focus-button" disabled={!onFocus} onClick={onFocus}
          title={onFocus ? "Focus on the task in hand (f)" : "Nothing on the line now or next"}>
          <TimerIcon size={19} /> Focus
        </button>
      </p>
      <AnimatePresence>{celebrate && <AllBumped key="bumped" total={total} />}</AnimatePresence>
      <span className="topbar-sep" aria-hidden />
      <nav className="r-presets presets" aria-label="Mode">
        {presets.map((p, i) => (
          <span key={p} className="preset-slot">
            {i > 0 && <span className="preset-dot" aria-hidden>·</span>}
            <button type="button" className="preset" aria-pressed={p === activePreset} onClick={() => onPreset?.(p)}>
              {p}
            </button>
          </span>
        ))}
      </nav>
      <div className="r-topbar-rule topbar-rule" aria-hidden />
    </header>
  );
}

// The date, and a chevron for the day menu: the theme (one button that steps Light, Dark, Auto), Share to toodoo,
// Sign out. A popover like the view menu: Escape or a click away closes it.
function DayMenu({ date, onSignOut }: { date: string; onSignOut?: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="daymenu" ref={root}>
      <button type="button" className="daymenu-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {date}
        <ChevronIcon size={18} className={`daymenu-chevron${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <span className="daymenu-pop" role="menu" aria-label="Day menu">
          <ThemeCycle />
          <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); go("share"); }}>Share to toodoo</button>
          {onSignOut && <button type="button" role="menuitem" className="daymenu-item" onClick={onSignOut}>Sign out</button>}
        </span>
      )}
    </span>
  );
}

// A thermal printer feeds paper in short jerks: each eighth of the way lands fast, then holds.
const feed = (t: number) => {
  const steps = 8;
  const k = Math.min(Math.floor(t * steps), steps - 1);
  return (k + Math.min(1, (t * steps - k) * 2.4)) / steps;
};

// The last docket bumped: a slip prints out of the rail under the count, then tears off and drops away.
// Under reduced motion it is a still tick beside the count that fades in and out.
export function AllBumped({ total }: { total: number }) {
  const still = useReducedMotion();
  if (still) {
    return (
      <m.span className="bumped-tick" data-testid="bumped-tick" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <CheckIcon size={22} />
      </m.span>
    );
  }
  return (
    <div className="bumped-slot" data-testid="bumped-slip" aria-hidden>
      <m.div
        className="bumped-slip"
        initial={{ y: "-101%" }}
        animate={{ y: "0%" }}
        exit={{ y: 46, rotate: 8, opacity: 0, transition: { duration: 0.34, ease: [0.5, 0, 0.9, 0.6] } }}
        transition={{ duration: 0.64, ease: feed }}
      >
        <span className="bumped-head">ALL BUMPED</span>
        <span className="bumped-count">{total}/{total}</span>
        <span className="bumped-dashes">--------------</span>
        <span className="bumped-foot">SERVICE</span>
      </m.div>
    </div>
  );
}
