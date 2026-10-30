import { rectSortingStrategy, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { View } from "@shared/board.ts";
import { isOptimistic, type NewTask } from "../lib/useActions";
import type { PassModel } from "./build";
import { Docket } from "./Docket";
import { Flight, type FlightPlan } from "./Flight";
import { CheckIcon } from "./icons";
import { reducedMotion } from "./motion";
import { launch, QuickAdd } from "./QuickAdd";
import { Rail, type RailGeo } from "./Rail";
import type { DocketData, GroupData } from "./types";
import { ViewMenu } from "./ViewMenu";

type Props = {
  model: PassModel;
  today: string;
  nowM: number;
  view: View;
  onView: (v: View) => void;
  quickAdd?: string;
  onSignOut?: () => void;
  onAdd?: (t: NewTask) => Promise<boolean>;
  onCreate?: (t: NewTask, files: File[]) => Promise<string | null>;
  onPlace?: (t: NewTask, date: string, start: number, mins: number) => Promise<boolean>;
  onOpen?: (id: string) => void;
  onTick?: (id: string, done: boolean) => void;
  onPlan?: (id: string) => void;
  dnd?: boolean; // dockets drag (to the line, and among themselves while the sort is manual)
  compact?: boolean; // Focus: the list is a narrow column of one-line stubs
  offline?: boolean; // no writes: the add line is disabled
  arrivals?: Map<string, number>; // dockets that just arrived from elsewhere, and their place in the stagger
  onTomorrow?: (id: string) => void; // set on the phone: dockets swipe (right to bump, left for Plan / Tomorrow)
  swipe?: boolean;
};

const NO_ARRIVALS = new Map<string, number>();

// Done today folds away and stays folded (per device) until it is opened again.
const DONE_KEY = "toodoo.doneOpen";
function useDoneOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(DONE_KEY) !== "0"; } catch { return true; }
  });
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(DONE_KEY, o ? "0" : "1"); } catch { /* holds for this visit */ }
    return !o;
  });
  return [open, toggle];
}

// A docket added from the quick add flies out of the input to its place in the rail. Until it lands, the
// docket there stays hidden: the optimistic one, and the saved one that replaces it mid-flight (a new id
// with the same title that was not on the board when the flight began).
type AddFlight = { plan: FlightPlan; known: Set<string> };
function useAddFlight(groups: GroupData[], scroll: React.RefObject<HTMLElement | null>, compact: boolean) {
  const [flight, setFlight] = useState<AddFlight | null>(null);
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    const all = groups.flatMap((g) => g.dockets);
    for (const d of all) {
      if (!isOptimistic(d.id) || seen.current.has(d.id)) continue;
      seen.current.add(d.id);
      const from = launch.from;
      if (!from || Date.now() - launch.at > 1500 || reducedMotion()) continue;
      launch.from = null;
      const el = scroll.current?.querySelector<HTMLElement>(`[data-docket="${CSS.escape(d.id)}"]`);
      if (!el) continue;
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      const at = el.getBoundingClientRect();
      const w = at.width * 0.3;
      const h = at.height * 0.3;
      setFlight({
        plan: { docket: d, compact, at, from: { left: from.left + 14, top: from.top + (from.height - h) / 2, width: w, height: h } },
        known: new Set(all.filter((x) => x.id !== d.id).map((x) => x.id)),
      });
    }
  }, [groups, scroll, compact]);
  const hidden = (d: DocketData) =>
    !!flight && (d.id === flight.plan.docket.id || (!flight.known.has(d.id) && d.title === flight.plan.docket.title));
  const view = flight && (
    <Flight key={flight.plan.docket.id} plan={flight.plan} onDone={() => setFlight((f) => (f === flight ? null : f))} />
  );
  return { view, hidden };
}

export function TodoPanel({ model, today, nowM, view, onView, quickAdd, onSignOut, onAdd, onCreate, onPlace, onOpen, onTick, onPlan, dnd, compact = false, offline = false, arrivals = NO_ARRIVALS, onTomorrow, swipe = false }: Props) {
  const [comingOpen, setComingOpen] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const [doneOpen, toggleDone] = useDoneOpen();
  const scroll = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(
    () => model.groups.filter((g) => g.count > 0 || g.key === "today" || g.key === "comingup" || g.key === "done"), // Done stays, a place to drop onto
    [model.groups],
  );
  const shown = (g: GroupData) =>
    g.dockets.length > 0 && (g.key !== "comingup" || comingOpen) && (g.key !== "later" || laterOpen) && (g.key !== "done" || doneOpen);
  const flight = useAddFlight(groups, scroll, compact);

  return (
    <section id="todo" className={`todo${compact ? " is-compact" : ""}`} aria-labelledby="todo-title">
      <h2 id="todo-title" className="sr-only">To do</h2>
      <QuickAdd today={today} nowM={nowM} initial={quickAdd} onAdd={onAdd} onCreate={onCreate} onPlace={onPlace} onOpen={onOpen} disabled={offline} epics={model.epics} tags={model.tags} />
      {/* Changing between the rails and the Focus column crossfades the two forms. */}
      <AnimatePresence initial={false}>
        <m.div
          key={compact ? "stubs" : "rails"}
          className={`todo-scroll${compact ? " is-compact" : ""}`}
          ref={(n: HTMLDivElement | null) => {
            if (n) scroll.current = n;
          }}
          layoutScroll
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          {groups.map((g, i) => {
            const open = shown(g);
            const geo: RailGeo = compact ? "compact" : !open ? "slim" : g.dockets.every((d) => d.variant === "carried") ? "carried" : "today";
            return (
              <Rail
                key={g.key}
                label={g.label}
                count={g.count}
                geo={geo}
                drop={dnd && view.group === "status" && (g.key === "today" || g.key === "done" || g.key === "comingup") ? g.key : undefined}
                toggle={g.key === "comingup" ? { open: comingOpen, onToggle: () => setComingOpen((o) => !o) }
                  : g.key === "later" ? { open: laterOpen, onToggle: () => setLaterOpen((o) => !o) }
                  : g.key === "done" && g.count > 0 ? { open: doneOpen, onToggle: toggleDone } : undefined}
                extra={i === 0 ? <ViewMenu view={view} tags={model.tags} epics={model.epics} onChange={onView} /> : undefined}
              >
                {open && (
                  <SortableContext id={g.key} items={g.dockets.map((d) => d.id)} strategy={compact ? verticalListSortingStrategy : rectSortingStrategy}>
                    {g.dockets.map((d) => (
                      <Docket key={d.id} docket={d} topPick={d.id === model.topPickId} onOpen={onOpen} onTick={onTick} onPlan={onPlan}
                        dnd={dnd ? { manual: view.sort === "manual", moves: view.group === "status" } : undefined} compact={compact} arrival={arrivals.get(d.id)} inflight={flight.hidden(d)}
                        swipe={swipe ? { onTomorrow } : undefined} />
                    ))}
                  </SortableContext>
                )}
              </Rail>
            );
          })}
        </m.div>
      </AnimatePresence>
      {flight.view}
    </section>
  );
}
