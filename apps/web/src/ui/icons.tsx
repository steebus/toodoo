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
