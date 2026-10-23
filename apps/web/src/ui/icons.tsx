import { m, useReducedMotion } from "motion/react";

// Icon-sized glyphs (one 1.6 stroke family). Dockets, rails and the biro ring are plates, never drawn here.
type P = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});

export const CalendarIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
  </svg>
);

export const ClockIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 5.5V10l3 2" />
  </svg>
);

export const CheckIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} strokeWidth={2.4} className={className}>
    <path d="M3.5 10.5l4 4 9-10" />
  </svg>
);

// The same tick, drawn on when it turns on (never on first paint); under reduced motion it fades instead.
// `draw` draws it on mount too (a docket that was just bumped into a new rail).
export function DrawnCheck({ on, draw, size = 18, className }: P & { on: boolean; draw?: boolean }) {
  const still = useReducedMotion();
  return (
    <svg {...base(size)} strokeWidth={2.4} className={className}>
      <m.path
        d="M3.5 10.5l4 4 9-10"
        initial={draw ? (still ? { opacity: 0 } : { pathLength: 0 }) : false}
        animate={still ? { opacity: on ? [0, 1] : 1 } : { pathLength: on ? [0, 1] : 1 }}
        transition={{ duration: still ? 0.15 : 0.28, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}

export const ChevronIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} strokeWidth={1.8} className={className}>
    <path d="M4.5 7.5L10 13l5.5-5.5" />
  </svg>
);

export const GripIcon = ({ size = 14, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 10 14" fill="currentColor" aria-hidden focusable={false} className={className}>
    {[2, 7, 12].map((y) => (
      <g key={y}>
        <circle cx="2.5" cy={y} r="1.3" />
        <circle cx="7.5" cy={y} r="1.3" />
      </g>
    ))}
  </svg>
);

export const NowMarker = ({ className }: P) => (
  <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden focusable={false} className={className}>
    <path d="M0 0l12 9-12 9z" />
  </svg>
);

export const CloseIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} strokeWidth={1.8} className={className}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);

// ---------- the rooms and modes, each a sketch of its own screen ----------
// Day: a desk calendar, today's date on its page.
export const DayIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="3.5" width="15" height="14" rx="1.6" />
    <path d="M2.5 7.5h15M6.5 2v3M13.5 2v3" />
    <text x="10" y="15.6" textAnchor="middle" fontSize="7.4" fontWeight="700" fill="currentColor" stroke="none"
      fontFamily="var(--font-ui), sans-serif">{new Date().getDate()}</text>
  </svg>
);
// Board: a kanban, three columns with cards stacked in each.
export const BoardIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <g strokeWidth={1.1} opacity={0.6}>
      <rect x="1.6" y="2.5" width="4.8" height="15" rx="1" />
      <rect x="7.6" y="2.5" width="4.8" height="15" rx="1" />
      <rect x="13.6" y="2.5" width="4.8" height="15" rx="1" />
    </g>
    <g fill="currentColor" stroke="none">
      <rect x="2.55" y="3.9" width="2.9" height="2.9" rx="0.5" />
      <rect x="2.55" y="8.2" width="2.9" height="2.9" rx="0.5" />
      <rect x="8.55" y="3.9" width="2.9" height="2.9" rx="0.5" />
      <rect x="8.55" y="8.2" width="2.9" height="2.9" rx="0.5" />
      <rect x="8.55" y="12.5" width="2.9" height="2.9" rx="0.5" />
      <rect x="14.55" y="3.9" width="2.9" height="2.9" rx="0.5" />
    </g>
  </svg>
);
// Epics: a project folder, its work filed inside.
export const EpicsIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M2.5 15.5V5a1 1 0 0 1 1-1h4.3l1.8 2h6.9a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
    <path d="M2.5 9h15M6 12.5h5" strokeWidth={1.3} />
  </svg>
);
// Matrix: four quarters and dots of different sizes.
export const MatrixIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="2.5" width="15" height="15" rx="1.2" />
    <path d="M10 2.5v15M2.5 10h15" strokeWidth={1.1} />
    <circle cx="6" cy="6.2" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="13.6" cy="5.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="6.6" cy="13.8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="13.8" cy="13.6" r="2.1" fill="currentColor" stroke="none" />
  </svg>
);
// The Calendar room: a month page, rings at the top, a day ringed.
export const MonthIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="4" width="15" height="13.5" rx="1.2" />
    <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" />
    <path d="M6 11h1.4M9.3 11h1.4M12.6 11h1.4M6 14.2h1.4M9.3 14.2h1.4" strokeWidth={1.2} />
    <circle cx="13.3" cy="14.2" r="1.7" />
  </svg>
);
// Plan: the timeline, hours ticked down it and blocks along it.
export const PlanModeIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 2.5v15M3.5 5h1.5M3.5 10h1.5M3.5 15h1.5" />
    <rect x="7.5" y="3.5" width="10" height="3.5" rx="0.6" />
    <rect x="7.5" y="9.5" width="10" height="6" rx="0.6" />
  </svg>
);
// Capture: the tickets, a grid of squares.
export const CaptureModeIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="2.5" y="3" width="4" height="6" rx="0.6" />
    <rect x="8" y="3" width="4" height="6" rx="0.6" />
    <rect x="13.5" y="3" width="4" height="6" rx="0.6" />
    <rect x="2.5" y="11" width="4" height="6" rx="0.6" />
    <rect x="8" y="11" width="4" height="6" rx="0.6" />
  </svg>
);

// View: the group, sort and filter settings, as three sliders.
export const SlidersIcon = ({ size = 20, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3 5h14M3 10h14M3 15h14" />
    <circle cx="13" cy="5" r="2" fill="var(--rack, #fff)" />
    <circle cx="7" cy="10" r="2" fill="var(--rack, #fff)" />
    <circle cx="11.5" cy="15" r="2" fill="var(--rack, #fff)" />
  </svg>
);

export const CopyIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <path d="M13 4.5V4.2c0-.9-.7-1.7-1.6-1.7H4.2c-.9 0-1.7.8-1.7 1.7v7.2c0 .9.8 1.6 1.7 1.6h.3" />
  </svg>
);

export const PlusIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} strokeWidth={1.8} className={className}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const SunIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="10" cy="10" r="3.5" />
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
  </svg>
);

export const MoonIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M16 12.5A6.5 6.5 0 0 1 7.5 4a6.5 6.5 0 1 0 8.5 8.5z" />
  </svg>
);

export const AutoIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" />
  </svg>
);

// ---------- pen marks: done by hand in biro, on the paper (so in --biro, which never inverts) ----------

// A big tick dashed off in a hurry: a short hooked downstroke, then one long fast flick up and away,
// thinning as it goes. Drawn on when it turns on; under reduced motion it fades in.
export function PenTick({ on, draw, size = 30, className }: P & { on: boolean; draw?: boolean }) {
  const still = useReducedMotion();
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 40 32" fill="none" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable={false} className={className}>
      <m.path
        d="M2.5 17.8c1.6-.6 3.6.4 5.3 2.6 1.3 1.7 2.4 3.9 3.3 6.4.2.6.8.6 1.1.1C17.6 16.5 25.6 7.9 38.6 1.6"
        strokeWidth={2.6}
        initial={draw ? (still ? { opacity: 0 } : { pathLength: 0 }) : false}
        animate={still ? { opacity: on ? 1 : 0 } : { pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={{ duration: still ? 0.15 : 0.24, ease: [0.5, 0, 0.1, 1] }}
      />
    </svg>
  );
}

// The loop a pen makes round a box before it is ticked: the bump's empty state.
export const PenLoop = ({ size = 30, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
    strokeLinecap="round" aria-hidden focusable={false} className={className}>
    <path d="M12.6 3.1c4.9-.2 8.3 3.4 8.2 8.4-.1 5.2-4 8.9-8.9 8.8-4.8-.1-8.3-3.6-8.1-8.5C4 7 7.4 3.6 11.4 3.9" />
  </svg>
);

// Time spent against the estimate: a pencilled dotted line, inked over in biro as far as the time spent.
// Past the estimate the ink runs the whole way, in red.
export function PenProgress({ spent, est, className }: { spent: number; est: number; className?: string }) {
  const over = spent > est;
  const frac = Math.max(0.02, Math.min(1, spent / est));
  return (
    <svg className={`pen-progress${over ? " is-over" : ""}${className ? ` ${className}` : ""}`} viewBox="0 0 120 6" preserveAspectRatio="none"
      role="img" aria-label={`${spent}m of ${est}m`}>
      <path className="pen-progress-track" d="M1 3.2H119" pathLength={1} />
      <path className="pen-progress-ink" d="M1 3.4C14 2.4 27 4.1 40 3.1S66 2.5 80 3.5 105 2.6 119 3.3" pathLength={1}
        strokeDasharray="1 1" strokeDashoffset={1 - frac} />
    </svg>
  );
}

export const TimerIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="10" cy="11" r="6.5" />
    <path d="M10 11V7.5M8 2.5h4M15 5.5l1.2-1.2" />
  </svg>
);

export const PencilIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M13.5 3.5l3 3-9.5 9.5-3.8.8.8-3.8z" />
    <path d="M11.5 5.5l3 3" />
  </svg>
);

// An epic's tallies: open (a ring), doing (a play mark), high (a flag), blocked (a barred ring), late (a warning).
export const OpenIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="10" cy="10" r="6.5" />
  </svg>
);

export const PlayIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M6.5 4.5v11l9-5.5z" />
  </svg>
);

export const FlagIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M5 17.5V3M5 3.5h10l-2.5 3.5L15 10.5H5" />
  </svg>
);

export const BlockedIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M5.5 14.5l9-9" />
  </svg>
);

export const AlertIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10 3l7.5 13.5h-15z" />
    <path d="M10 8.5v3.5M10 14.3v.1" />
  </svg>
);

// A task's files: the ticket's file controls.
export const DownloadIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M10 3v9.5M6 8.5l4 4 4-4M4 16.5h12" />
  </svg>
);

export const SwapIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h11l-3-3M16 13H5l3 3" />
  </svg>
);

export const TrashIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}>
    <path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11M8.5 8.5v5M11.5 8.5v5" />
  </svg>
);

// The Claude Code robot, in solid blocks: a wide body, arm nubs, two square eyes, four stubby legs. It takes the text
// colour, so it is a stamp wherever it sits.
export const ClaudeStamp = ({ size = 14, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`claude-stamp${className ? " " + className : ""}`} aria-hidden focusable={false}>
    <path fillRule="evenodd" d="M5 5h14v11H5zM2 9h3v4H2zM19 9h3v4h-3zM8 8h2.5v3H8zM13.5 8H16v3h-2.5z" />
    <path d="M6.5 16h2v4h-2zM10 16h1.5v4H10zM12.5 16H14v4h-1.5zM15.5 16h2v4h-2z" />
  </svg>
);
