import { useState } from "react";
import type { Actions } from "../lib/useActions";
import { NextUp, nextUpHeight } from "./NextUp";
import { Divider } from "./Panes";
import { clampZoom, Timeline } from "./Timeline";
import type { BoardData, NextUpItem, PlanData } from "./types";

export type DayNavProps = { date: string; onDate: (d: string) => void };

type Props = {
  plan: PlanData; board?: BoardData; actions?: Actions;
  nextUp?: { items: NextUpItem[]; onPlanAll?: () => void; onOpen?: (id: string) => void };
};

// Kept on this device: the line's zoom and whether Next up is folded.
const ZOOM_KEY = "toodoo.planZoom";
const NEXTUP_KEY = "toodoo.nextUpOpen";
const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window: just not kept */
  }
};

// The Day plan panel: all-day chips across its head when there are any, Next up, then the line.
// Zoom is Ctrl + wheel or a pinch on the line.
export function DayPlan({ plan, board, actions, nextUp }: Props) {
  const { allDay } = plan;
  const [zoom, setZoomState] = useState(() => clampZoom(Number(stored(ZOOM_KEY)) || 1));
  const setZoom = (z: number) => {
    const next = Math.round(z * 100) / 100;
    setZoomState(next);
    keep(ZOOM_KEY, String(next));
  };
  const [nuOpen, setNuOpen] = useState(() => stored(NEXTUP_KEY) !== "0");
  const toggleNu = () => {
    setNuOpen(!nuOpen);
    keep(NEXTUP_KEY, nuOpen ? "0" : "1");
  };
  const n = nextUp?.items.length ?? 0;
  return (
    <section id="dayplan" className="dayplan" aria-labelledby="dayplan-title"
      style={{ ["--nu-h" as string]: nextUpHeight(n, nuOpen), ["--ad-h" as string]: allDay.length ? "3.6cqh" : "0cqh" }}>
      <h2 id="dayplan-title" className="sr-only">Day plan</h2>
      {allDay.length > 0 && (
        <div className="dayplan-head">
          <ul className="allday" aria-label="All day">
            {allDay.map((e) => (
              <li key={e.id} className="allday-chip" title={e.title}>{e.title}</li>
            ))}
          </ul>
        </div>
      )}
      {n > 0 && <NextUp items={nextUp!.items} onPlanAll={nextUp!.onPlanAll} onOpen={nextUp!.onOpen} open={nuOpen} onToggle={toggleNu} />}
      <Timeline plan={plan} board={board} actions={actions} onOpen={nextUp?.onOpen} zoom={zoom} onZoom={setZoom} />
      <div className="r-panel-divider panel-divider" aria-hidden />
      <Divider controls="dayplan todo" />
    </section>
  );
}
