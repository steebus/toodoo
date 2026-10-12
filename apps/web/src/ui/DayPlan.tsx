import { useEffect, useMemo, useRef } from "react";
import { layoutLanes, toHM } from "@shared/planning.ts";
import { clock12, hourLabel } from "./format";
import { GripIcon, NowMarker } from "./icons";
import { blockHeight, blockTop, gridHeight, LINE_DROP, minToPx, NOW_LEAD } from "./plan";
import type { PlanData } from "./types";

// Read-only: moving and resizing blocks arrives with the editing task.
export function DayPlan({ plan }: { plan: PlanData }) {
  const { startM, endM, blocks, allDay, nowM, anchorM } = plan;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, minToPx(anchorM, startM) - 140);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- open scrolled once, then leave the scroll to the reader

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = startM; m <= endM; m += 60) out.push(m);
    return out;
  }, [startM, endM]);
  const lanes = useMemo(() => layoutLanes(blocks.map((b) => ({ ...b, s: b.startM, e: b.startM + b.mins }))), [blocks]);

  return (
    <section className="dayplan" aria-labelledby="dayplan-title">
      <h2 id="dayplan-title" className="r-dayplan-title panel-title">Day plan</h2>
      {allDay.length > 0 && (
        <ul className="allday" aria-label="All day">
          {allDay.map((e) => (
            <li key={e.id} className="allday-chip" title={e.title}>{e.title}</li>
          ))}
        </ul>
      )}
      <div className="plan-scroll" ref={scroller}>
        <div className="plan-grid" style={{ height: gridHeight(startM, endM) }}>
          <div className="hour-lines" aria-hidden>
            {hours.map((m) => (
              <span key={m} className="hour-line" style={{ top: minToPx(m, startM) + LINE_DROP }} />
            ))}
          </div>
          <ol className="hour-labels" aria-label="Hours">
            {hours.map((m) => (
              <li key={m} className="hour-label" style={{ top: minToPx(m, startM) }}>
                {hourLabel(m / 60)}
              </li>
            ))}
          </ol>
          <ol className="plan-blocks" aria-label="Plan">
            {lanes.map((b) => (
              <li
                key={b.id}
                className={`plan-block plan-${b.kind}${b.current ? " is-current" : ""}`}
                style={{
                  top: blockTop(b.startM, startM),
                  height: blockHeight(b.mins),
                  left: `calc(var(--lane-left) + ${b.col} * var(--lane-w) / ${b.cols})`,
                  width: `calc(var(--lane-w) / ${b.cols}${b.cols > 1 ? " - 0.3cqw" : ""})`,
                }}
              >
                <span className="plan-time">{b.time}</span>
                <span className="plan-title">
                  {b.title}
                  {b.duration && (
                    <>
                      <span className="sep" aria-hidden>·</span>
                      {b.duration}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {nowM !== null && (
            <p className="nowline" style={{ top: minToPx(nowM, startM) - NOW_LEAD }} aria-label={`Now ${clock12(toHM(nowM))}`}>
              <NowMarker className="now-marker" />
              <span className="now-time">{clock12(toHM(nowM))}</span>
              <span className="now-rule" aria-hidden />
            </p>
          )}
        </div>
      </div>
      <div className="r-panel-divider panel-divider" aria-hidden />
      <button type="button" className="r-divider-grip divider-grip" aria-label="Resize panels">
        <GripIcon />
      </button>
    </section>
  );
}
