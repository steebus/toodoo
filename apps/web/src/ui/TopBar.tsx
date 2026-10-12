import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { CheckIcon } from "./icons";

type Props = {
  date: string; headline: string; done: number; total: number; presets: string[]; activePreset: string; onPreset?: (p: string) => void;
  celebrate?: boolean;
};

export function TopBar({ date, headline, done, total, presets, activePreset, onPreset, celebrate = false }: Props) {
  return (
    <header className="topbar">
      <p className="r-wordmark wordmark">toodoo</p>
      <h1 className="r-date date">{date}</h1>
      {/* The hero line: the one thing that moves on first paint. */}
      <p className="r-headline headline">
        <m.span key={headline} className="headline-line" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
          {headline}
        </m.span>
      </p>
      <p className="r-progress progress">
        <span>{`${done} of ${total} done`}</span>
        <span className="progress-track" aria-hidden>
          <m.span className="progress-fill" initial={false} animate={{ scaleX: total ? done / total : 0 }} />
        </span>
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
