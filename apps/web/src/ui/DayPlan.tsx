import { useEffect, useState } from "react";
import { formatDuration } from "@shared/planning.ts";
import type { Actions, AutoPlanOptions, PlanPreview } from "../lib/useActions";
import { NextUp, nextUpHeight } from "./NextUp";
import { Divider } from "./Panes";
import { clampZoom, Timeline } from "./Timeline";
import type { BoardData, NextUpItem, PlanData } from "./types";

export type DayNavProps = { date: string; onDate: (d: string) => void };

type Props = {
  plan: PlanData; board?: BoardData; actions?: Actions;
  nextUp?: { items: NextUpItem[]; onOpen?: (id: string) => void; autoPlan?: { date: string; today: string } };
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
  // Auto plan shows what it would do on the line first: Accept saves exactly that (the same seed), Shuffle swaps
  // near-equal tasks, Cancel drops it. Another day than the one shown is planned straight away, with Undo.
  const [preview, setPreview] = useState<{ o: AutoPlanOptions; r: PlanPreview } | null>(null);
  useEffect(() => setPreview(null), [board?.date]);
  const show = async (o: AutoPlanOptions) => {
    if (!actions) return;
    if (o.date !== board?.date) return void actions.autoPlan(o);
    const seeded = { ...o, seed: o.seed ?? 1 }; // Accept sends the same seed, so it saves what was shown
    const r = await actions.previewPlan(seeded);
    if (r) setPreview({ o: seeded, r });
  };
  const ap = nextUp?.autoPlan && actions && {
    ...nextUp.autoPlan,
    run: (o: AutoPlanOptions) => void show(o),
    replan: (o: AutoPlanOptions) => { setPreview(null); void actions.replan(o); },
  };
  const bar = preview && (
    <div className="autoplan-preview" role="group" aria-label="Auto plan preview">
      <p className="autoplan-preview-says">
        {preview.r.proposed.length ? `${preview.r.proposed.length} blocks` : "Nothing to plan"}
        {preview.r.slack_mins >= 15 && ` · ${formatDuration(preview.r.slack_mins)} slack`}
      </p>
      <button type="button" className="autoplan-accept" disabled={!preview.r.proposed.length}
        onClick={() => { setPreview(null); void actions?.autoPlan(preview.o); }}>Accept</button>
      <button type="button" onClick={() => void show({ ...preview.o, seed: (preview.o.seed ?? 1) + 1 })}>Shuffle</button>
      <button type="button" onClick={() => setPreview(null)}>Cancel</button>
    </div>
  );
  const n = nextUp?.items.length ?? 0;
  // Next up shows while it has items, or (head only) while Auto plan can run: with nothing due it brings work forward.
  const shown = n > 0 || !!ap;
  return (
    <section id="dayplan" className="dayplan" aria-labelledby="dayplan-title"
      style={{ ["--nu-h" as string]: nextUpHeight(bar ? 1 : n, (nuOpen && n > 0) || !!bar, shown), ["--ad-h" as string]: allDay.length ? "3.6cqh" : "0cqh" }}>
      <h2 id="dayplan-title" className="sr-only">Day plan</h2>
      {allDay.length > 0 && (
        <div className="dayplan-head">
          <ul className="allday" aria-label="All day">
            {allDay.map((e) => (
              <li key={e.id} className={`allday-chip${e.colour ? " has-cal" : ""}`} title={e.title}
                style={e.colour ? { ["--cal" as string]: `var(--cal-${e.colour})` } : undefined}>{e.title}</li>
            ))}
          </ul>
        </div>
      )}
      {shown && <NextUp items={nextUp!.items} autoPlan={ap || undefined} preview={bar} onOpen={nextUp!.onOpen} open={nuOpen && n > 0} onToggle={n > 0 ? toggleNu : undefined} />}
      <Timeline plan={plan} board={board} actions={actions} onOpen={nextUp?.onOpen} zoom={zoom} onZoom={setZoom} preview={preview?.r.proposed} />
      <div className="r-panel-divider panel-divider" aria-hidden />
      <Divider controls="dayplan todo" />
    </section>
  );
}
