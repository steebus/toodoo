import { animate, m, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { buzz, columnAt } from "../lib/swipe";
import { reducedMotion, SNAPPY } from "./motion";

type Props = {
  columns: string[]; // the Board's column names, in order
  from: number; // the column the card is in
  held: boolean; // dnd-kit has it (a stationary long press): the paper stays put
  disabled: boolean;
  onMove: (to: number) => void;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
};

// A Board card on the phone. Swipe it right to move it on a column, left to move it back; the further it is pulled,
// the more columns it goes. While it moves, the columns show in a row under it with the one it would land in lit,
// and the paper uncovers that column's name; let go short of the first step and it springs back.
export function ColumnSwipe({ columns, from, held, disabled, onMove, className, style, children }: Props) {
  const x = useMotionValue(0);
  const [to, setTo] = useState(from);
  const last = useRef(from);
  const moved = useRef(0);
  const shown = useTransform(x, [-40, -12, 0, 12, 40], [1, 0, 0, 0, 1]);
  const flying = useRef(false);
  useMotionValueEvent(x, "change", (v) => {
    if (flying.current) return;
    const c = columnAt(v, from, columns.length);
    if (c === last.current) return;
    last.current = c;
    setTo(c);
    buzz(6); // a notch as it passes each column
  });
  const end = () => {
    moved.current = Date.now();
    const c = held ? from : columnAt(x.get(), from, columns.length);
    const reset = () => {
      flying.current = false;
      last.current = from;
      setTo(from);
      x.set(0);
    };
    if (c === from) {
      reset();
      animate(x, 0, reducedMotion() ? { duration: 0 } : SNAPPY);
      return;
    }
    // Landing in another column: the paper flies off the way it was going, then moves (and leaves this list).
    buzz(12);
    flying.current = true;
    const away = Math.sign(c - from) * (window.innerWidth || 400);
    const done = () => { onMove(c); reset(); };
    if (reducedMotion()) return done();
    void animate(x, away, { type: "tween", duration: 0.16, ease: [0.4, 0, 1, 1] }).then(done);
  };
  const right = to > from;
  return (
    <>
      <m.div className={`cs-under${right ? " is-right" : ""}`} style={{ opacity: shown }} aria-hidden>
        {to !== from && <span className="cs-under-name">{right ? `→ ${columns[to]}` : `${columns[to]} ←`}</span>}
      </m.div>
      <m.ol className="cs-track" style={{ opacity: shown }} aria-hidden>
        {columns.map((c, i) => (
          <li key={c} className={`cs-col${i === from ? " is-from" : ""}${i === to ? " is-to" : ""}`}>{c}</li>
        ))}
      </m.ol>
      <m.div
        className={className}
        style={{ ...style, x }}
        drag={held || disabled ? false : "x"}
        dragDirectionLock
        dragMomentum={false}
        onDragStart={() => (moved.current = Date.now())}
        onDragEnd={end}
        onClickCapture={(e) => {
          // The click a swipe ends with is not a tap: it does not open the card.
          if (Date.now() - moved.current > 250) return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children}
      </m.div>
    </>
  );
}
