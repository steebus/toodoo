import { GripIcon, NowMarker } from "./icons";
import type { HeroData } from "./types";

type Props = Pick<HeroData, "hours" | "now" | "blocks">;

// Static rendering: hour rows sit on the comp's measured pitch; Task 6 maps times to positions.
const FIRST_HOUR_Y = 160;
const HOUR_PITCH = 68.6;

export function DayPlan({ hours, now, blocks }: Props) {
  return (
    <section className="dayplan" aria-labelledby="dayplan-title">
      <h2 id="dayplan-title" className="r-dayplan-title panel-title">Day plan</h2>
      <div className="r-hour-lines hour-lines" aria-hidden>
        {hours.map((h, i) => (
          <span key={h} className="hour-line" style={{ top: FIRST_HOUR_Y + 2 + i * HOUR_PITCH - 138 }} />
        ))}
      </div>
      <ol className="r-hour-labels hour-labels" aria-label="Hours">
        {hours.map((h, i) => (
          <li key={h} className="hour-label" style={{ top: FIRST_HOUR_Y + i * HOUR_PITCH - 148 }}>
            {h}
          </li>
        ))}
      </ol>
      <ol className="plan-blocks" aria-label="Plan">
        {blocks.map((b) => (
          <li key={b.id} className={`r-${b.id} plan-block plan-${b.kind}${b.current ? " is-current" : ""}`}>
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
      <p className="r-nowline nowline" aria-label={`Now ${now}`}>
        <NowMarker className="now-marker" />
        <span className="now-time">{now}</span>
        <span className="now-rule" aria-hidden />
      </p>
      <div className="r-panel-divider panel-divider" aria-hidden />
      <button type="button" className="r-divider-grip divider-grip" aria-label="Resize panels">
        <GripIcon />
      </button>
    </section>
  );
}
