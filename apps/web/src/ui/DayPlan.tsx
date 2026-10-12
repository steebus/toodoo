import { useRef } from "react";
import { addDays, daysBetween, dayWord } from "@shared/planning.ts";
import type { Actions } from "../lib/useActions";
import { Divider } from "./Panes";
import { Timeline } from "./Timeline";
import type { BoardData, PlanData } from "./types";

export type DayNavProps = { date: string; onDate: (d: string) => void };

type Props = { plan: PlanData; board?: BoardData; actions?: Actions; nav?: DayNavProps; tabpanel?: boolean };

// The Day plan panel: title, all-day chips and day navigation in the header, the line below.
export function DayPlan({ plan, board, actions, nav, tabpanel }: Props) {
  const { allDay } = plan;
  return (
    <section id="dayplan" className="dayplan" aria-labelledby="dayplan-title" role={tabpanel ? "tabpanel" : undefined}>
      <h2 id="dayplan-title" className="r-dayplan-title panel-title">Day plan</h2>
      <div className="dayplan-head">
        {allDay.length > 0 && (
          <ul className="allday" aria-label="All day">
            {allDay.map((e) => (
              <li key={e.id} className="allday-chip" title={e.title}>{e.title}</li>
            ))}
          </ul>
        )}
        {nav && board && <DayNav {...nav} today={board.today} />}
      </div>
      <Timeline plan={plan} board={board} actions={actions} />
      <div className="r-panel-divider panel-divider" aria-hidden />
      <Divider controls="dayplan todo" />
    </section>
  );
}

const shortDay = (d: string) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .format(new Date(d + "T12:00:00Z")).replace(",", "");

function relative(date: string, today: string): string {
  if (date === today) return "";
  const w = dayWord(date, today);
  if (w === "tomorrow" || w === "yesterday") return w[0].toUpperCase() + w.slice(1);
  const n = daysBetween(today, date);
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

// Quiet mono controls: ‹ date › and, away from today, how far away it is and a way back.
function DayNav({ date, today, onDate }: DayNavProps & { today: string }) {
  const picker = useRef<HTMLInputElement>(null);
  const rel = relative(date, today);
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
        <button type="button" className="daynav-date" aria-label={`Choose day, ${shortDay(date)}`} onClick={open}>
          {shortDay(date)}
        </button>
        <input
          ref={picker}
          type="date"
          className="daynav-input"
          tabIndex={-1}
          aria-hidden
          value={date}
          onChange={(e) => e.target.value && onDate(e.target.value)}
        />
      </span>
      <button type="button" className="daynav-step" aria-label="Next day" onClick={() => onDate(addDays(date, 1))}>›</button>
      {rel && <span className="daynav-rel">{rel}</span>}
      {date !== today && (
        <button type="button" className="daynav-today" onClick={() => onDate(today)}>Today</button>
      )}
    </nav>
  );
}
