import { useEffect, useState } from "react";
import { nowMin, toHM } from "@shared/planning.ts";
import { clock12 } from "./format";

// Seconds into the day, on the planner's clock (Brisbane).
const nowSec = () => {
  const d = new Date();
  return nowMin(d) * 60 + d.getSeconds();
};

const pad = (n: number) => String(n).padStart(2, "0");
const hms = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
};

// A wind-up kitchen timer: a dial of sixty minutes, the red wedge the time left (a full dial past an hour), winding
// down live to the block's end. Before the block starts it counts down to the start instead, in grey.
export function KitchenTimer({ startM, endM }: { startM: number; endM: number }) {
  const [now, setNow] = useState(nowSec);
  useEffect(() => {
    const id = setInterval(() => setNow(nowSec()), 1000);
    return () => clearInterval(id);
  }, []);
  const waiting = now < startM * 60;
  const left = Math.max(0, (waiting ? startM * 60 : endM * 60) - now);
  const up = !waiting && left === 0;
  const frac = Math.min(1, left / 3600);
  // The wedge: from twelve o'clock, clockwise, as a dial wound to the minutes left.
  const r = 78, cx = 100, cy = 100;
  const a = frac * 2 * Math.PI;
  const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
  const wedge = frac >= 0.9999
    ? `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}Z`
    : `M${cx} ${cy}L${cx} ${cy - r}A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x} ${y}Z`;
  return (
    <div className={`kitchen-timer${waiting ? " is-waiting" : ""}${up ? " is-up" : ""}`} role="timer"
      aria-label={up ? "Time's up" : `${hms(left)} ${waiting ? "until it starts" : "left"}`}>
      <svg viewBox="0 0 200 200" className="kt-dial" aria-hidden>
        <circle cx={cx} cy={cy} r={94} className="kt-body" />
        {Array.from({ length: 60 }, (_, i) => {
          const t = (i / 60) * 2 * Math.PI, long = i % 5 === 0;
          return <line key={i} className={long ? "kt-tick is-long" : "kt-tick"}
            x1={cx + 88 * Math.sin(t)} y1={cy - 88 * Math.cos(t)} x2={cx + (long ? 80 : 84) * Math.sin(t)} y2={cy - (long ? 80 : 84) * Math.cos(t)} />;
        })}
        {left > 0 && <path d={wedge} className="kt-wedge" />}
        <line x1={cx} y1={cy} x2={left > 0 ? x : cx} y2={left > 0 ? y : cy - r} className="kt-hand" />
        <circle cx={cx} cy={cy} r={17} className="kt-knob" />
        <rect x={cx - 3.5} y={cy - 15} width={7} height={30} rx={3} className="kt-grip" />
      </svg>
      <p className="kt-left">{up ? "TIME" : hms(left)}</p>
      <p className="kt-label">
        {up ? `ended ${clock12(toHM(endM))}` : waiting ? `until it starts at ${clock12(toHM(startM))}` : `left, to ${clock12(toHM(endM))}`}
      </p>
    </div>
  );
}
