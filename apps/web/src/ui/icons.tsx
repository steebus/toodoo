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
