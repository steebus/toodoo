import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useQuery } from "convex/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { api } from "@convex/_generated/api";
import { addDays } from "@shared/planning.ts";
import { useFitText } from "../lib/useFitText";
import { compactDate, longDate } from "./format";
import { go, type Room } from "../lib/useRoute";
import { CaptureModeIcon, CheckIcon, ChevronIcon, PlanModeIcon, TimerIcon } from "./icons";
import { RoomNav } from "./RoomNav";

type Props = {
  date: string; dateShort?: string; headline: string; total: number; presets: string[]; activePreset: string; onPreset?: (p: string) => void;
  celebrate?: boolean; offline?: boolean; unsaved?: boolean; reconnecting?: boolean;
  room?: Room; // the room nav, and which room is lit; none in the fixture
  nav?: { date: string; today: string; onDate: (d: string) => void }; // the Day: the date steps through days
  onFocus?: () => void; // Focus on the task in hand; missing when there is nothing on the line now or next
  dateSlot?: (el: HTMLElement | null) => void; // a room's own controls in the date's place (the calendar's month picker)
  end?: ReactNode; // a room's own controls in the right-hand corner, in place of Focus and the presets
};

// The one header row, the same in every room: the wordmark (its chevron opens the menu: theme, share, sign out)
// and rooms, the date (on the Day, ‹ date › through the days) over the day's line, Focus, and the Plan · Capture presets.
export function TopBar({ date, dateShort, headline, total, presets, activePreset, onPreset, onFocus, end, dateSlot, celebrate = false, offline = false, unsaved = false, reconnecting = false, room, nav }: Props) {
  const line = useRef<HTMLParagraphElement>(null);
  useFitText(line, headline, 0.6);
  useClearOfRooms(line);
  return (
    <header className="topbar">
      <p className="r-wordmark wordmark">{room ? <AppMenu /> : "toodoo"}</p>
      {room && <RoomNav room={room} />}
      {offline && <span className="offline-stamp" role="status">{unsaved ? "unsaved" : reconnecting ? "reconnecting" : "offline"}</span>}
      <h1 className="r-date date" aria-label={dateSlot ? undefined : nav ? longDate(nav.date) : date}>
        {dateSlot ? <span className="date-slot" ref={dateSlot} /> : nav ? <DayNav {...nav} /> : <DateText date={date} short={dateShort} />}
      </h1>
      {/* The hero line: the one thing that moves on first paint (CSS, so it never waits on script). */}
      <p ref={line} className="r-headline headline" title={headline || undefined}>
        <span key={headline} className="headline-line">{headline}</span>
      </p>
      {/* Focus · Plan · Capture: one button set at the right. Focus is an action; Plan and Capture a two-way switch,
          the lit side sliding across. A room other than the Day puts its own controls here instead (`end`). */}
      {end ? <div className="topbar-end">{end}</div> : (
        <div className="topbar-end">
          <nav className="r-presets presets mode-switch" aria-label="Mode">
            <button type="button" className="preset preset-focus" aria-label="Focus" disabled={!onFocus} onClick={onFocus}
              title={onFocus ? "Focus on the task in hand (f)" : "Nothing on the line now or next"}>
              <TimerIcon size={20} />
            </button>
            {presets.map((p) => (
              <button key={p} type="button" className="preset" aria-pressed={p === activePreset} aria-label={p} title={p} onClick={() => onPreset?.(p)}>
                {p === activePreset && <m.span className="mode-ink" layoutId="mode-ink" aria-hidden />}
                {p === "Plan" ? <PlanModeIcon /> : p === "Capture" ? <CaptureModeIcon /> : p}
              </button>
            ))}
          </nav>
        </div>
      )}
      <AnimatePresence>{celebrate && <AllBumped key="bumped" total={total} />}</AnimatePresence>
      <div className="r-topbar-rule topbar-rule" aria-hidden />
    </header>
  );
}

// The day's line keeps a hard edge at the rule after the rooms: on a narrow window the rooms (sized in the comp's
// unit) reach past its 26.4% inset, so it is drawn in from both sides (staying centred under the date) to a gap
// beyond that rule. Only where the bar is laid out as the comp (the line placed absolutely).
function useClearOfRooms(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    const frame = el?.offsetParent as HTMLElement | null;
    const rooms = el?.parentElement?.querySelector<HTMLElement>(".rooms");
    if (!el || !frame || !rooms) return;
    const fit = () => {
      el.style.left = el.style.width = "";
      if (getComputedStyle(el).position !== "absolute") return;
      const rule = getComputedStyle(rooms, "::after");
      const gap = parseFloat(rule.left) - rooms.offsetWidth; // the rule sits a gap past the rooms; the line keeps the same
      const end = rooms.getBoundingClientRect().left - frame.getBoundingClientRect().left + parseFloat(rule.left) + 1 + (gap || 0);
      const w = frame.clientWidth;
      if (!(end > el.offsetLeft)) return;
      el.style.left = `${end}px`;
      el.style.width = `${Math.max(0, w - 2 * end)}px`;
    };
    fit();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(frame);
    ro?.observe(rooms);
    return () => ro?.disconnect();
  }, [ref]);
}

function DateText({ date, short }: { date: string; short?: string }) {
  return (
    <>
      <span className={short ? "date-long" : undefined}>{date}</span>
      {short && <span className="date-short" aria-hidden>{short}</span>}
    </>
  );
}

// A day rolls in from the side you went: later from below, earlier from above. Quick, and a new click cuts the
// last roll short (popLayout lets the old date leave while the new one arrives), so it keeps up with the clicks.
const ROLL = {
  in: (dir: number) => ({ y: `${dir * 80}%`, opacity: 0 }),
  at: { y: "0%", opacity: 1 },
  out: (dir: number) => ({ y: `${dir * -80}%`, opacity: 0 }),
};

// ‹ date ›: the date opens the calendar; away from today, a way back.
// The label is the nav's own date, not the board's: the board lags a click behind while the day loads, and a roll
// keyed on one date showing another just jumps.
function DayNav({ date, today, onDate }: { date: string; today: string; onDate: (d: string) => void }) {
  const label = longDate(date);
  const picker = useRef<HTMLInputElement>(null);
  const was = useRef(date);
  const dir = date < was.current ? -1 : 1;
  useEffect(() => { was.current = date; }, [date]);
  const open = () => {
    const el = picker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };
  return (
    <nav className="daynav" aria-label="Day">
      <button type="button" className="daynav-step" aria-label="Previous day" onClick={() => onDate(addDays(date, -1))}>‹</button>
      <span className="daynav-pick">
        <button type="button" className="daynav-date" aria-label={`Choose day, ${label}`} onClick={open}>
          <AnimatePresence initial={false} mode="popLayout" custom={dir}>
            <m.span key={date} className="daynav-roll" custom={dir} variants={ROLL} initial="in" animate="at" exit="out"
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
              <DateText date={label} short={compactDate(date)} />
            </m.span>
          </AnimatePresence>
        </button>
        <input ref={picker} type="date" className="daynav-input" tabIndex={-1} aria-hidden value={date}
          onChange={(e) => e.target.value && onDate(e.target.value)} />
      </span>
      <button type="button" className="daynav-step" aria-label="Next day" onClick={() => onDate(addDays(date, 1))}>›</button>
      {date !== today && <button type="button" className="daynav-today" onClick={() => onDate(today)}>Today</button>}
    </nav>
  );
}

// The wordmark, and a chevron for the menu: All tasks, Suggested, Tidy up, Stats, Share to toodoo, Settings (where the
// theme, calendars, Jira, notifications and Sign out live). A popover like the view menu: Escape or a click away closes it.
function AppMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const counted = useQuery(api.stats.tidyCount, {});
  const waiting = useQuery(api.inbox.count, {});
  const suggested = typeof waiting === "number" ? waiting : 0;
  // The wordmark's one count: suggestions waiting, plus tasks to tidy.
  const tidy = (typeof counted === "number" ? counted : 0) + suggested;
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
      <button type="button" className="daymenu-button" aria-haspopup="menu" aria-expanded={open} aria-label="Menu" onClick={() => setOpen((o) => !o)}>
        <span className="daymenu-name">
          toodoo
          {tidy > 0 && <span key={tidy} className="tidy-badge" aria-label={`${tidy} to sort`}>{tidy > 99 ? "99+" : tidy}</span>}
        </span>
        <ChevronIcon size={18} className={`daymenu-chevron${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <span className="daymenu-pop" role="menu" aria-label="Menu">
          <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); go("tasks"); }}>All tasks</button>
          <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); go("suggested"); }}>
            Suggested{suggested > 0 && <span className="count-chip">{suggested}</span>}
          </button>
          <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); go("tidy"); }}>
            Tidy up{tidy - suggested > 0 && <span className="count-chip">{tidy - suggested}</span>}
          </button>
          <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); go("stats"); }}>Stats</button>
          <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); go("share"); }}>Share to toodoo</button>
          <button type="button" role="menuitem" className="daymenu-item" onClick={() => { setOpen(false); go("settings"); }}>Settings</button>
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
