import { horizontalListSortingStrategy, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { spanOf, type View } from "@shared/board.ts";
import railCarried from "../assets/plates/rail-carried.png";
import railComingup from "../assets/plates/rail-comingup.png";
import railToday from "../assets/plates/rail-today.png";
import { isOptimistic, type NewTask } from "../lib/useActions";
import type { PassModel } from "./build";
import { Docket } from "./Docket";
import { Flight, type FlightPlan } from "./Flight";
import { clock12 } from "./format";
import { CheckIcon } from "./icons";
import { NextUp } from "./NextUp";
import { reducedMotion } from "./motion";
import { launch, QuickAdd } from "./QuickAdd";
import { Rail, type RailGeo } from "./Rail";
import type { GroupData, Legend } from "./types";
import { ViewMenu } from "./ViewMenu";

const PLATE: Record<Exclude<RailGeo, "compact">, string> = { carried: railCarried, today: railToday, slim: railComingup };

type Props = {
  model: PassModel;
  today: string;
  nowM: number;
  view: View;
  onView: (v: View) => void;
  legend?: Legend;
  quickAdd?: string;
  onSignOut?: () => void;
  onAdd?: (t: NewTask) => Promise<boolean>;
  onOpen?: (id: string) => void;
  onTick?: (id: string, done: boolean) => void;
  onPlan?: (id: string) => void;
  onPlanAll?: () => void;
  dnd?: boolean; // dockets drag (to the line, and among themselves while the sort is manual)
  compact?: boolean; // Focus: the list is a narrow column of one-line stubs
  arrivals?: Map<string, number>; // dockets that just arrived from elsewhere, and their place in the stagger
};

const NO_ARRIVALS = new Map<string, number>();

// A docket added from the quick add flies out of the input to its place in the rail.
function useAddFlight(groups: GroupData[], scroll: React.RefObject<HTMLElement | null>, compact: boolean) {
  const [flight, setFlight] = useState<FlightPlan | null>(null);
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    for (const d of groups.flatMap((g) => g.dockets)) {
      if (!isOptimistic(d.id) || seen.current.has(d.id)) continue;
      seen.current.add(d.id);
      const from = launch.from;
      if (!from || Date.now() - launch.at > 1500 || reducedMotion()) continue;
      launch.from = null;
      const target = `[data-docket="${CSS.escape(d.id)}"]`;
      const el = scroll.current?.querySelector<HTMLElement>(target);
      if (!el) continue;
      el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      const at = el.getBoundingClientRect();
      const w = at.width * 0.3;
      const h = at.height * 0.3;
      setFlight({ docket: d, compact, at, target, from: { left: from.left + 14, top: from.top + (from.height - h) / 2, width: w, height: h } });
    }
  }, [groups, scroll, compact]);
  return flight && <Flight key={flight.docket.id} plan={flight} onDone={() => setFlight(null)} />;
}

// Which dockets are inside the scroll area right now. null = unknown (no IntersectionObserver): treat all as visible.
function useVisibleDockets(root: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  const [visible, setVisible] = useState<Set<string> | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set((e.target as HTMLElement).dataset.docket!, e.isIntersecting);
        setVisible(new Set([...seen].filter(([, v]) => v).map(([k]) => k)));
      },
      { root: el, threshold: 0.5 },
    );
    el.querySelectorAll("[data-docket]").forEach((n) => io.observe(n));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe when the dockets on screen change
  }, deps);
  return visible;
}

export function TodoPanel({ model, today, nowM, view, onView, legend, quickAdd, onSignOut, onAdd, onOpen, onTick, onPlan, onPlanAll, dnd, compact = false, arrivals = NO_ARRIVALS }: Props) {
  const [comingOpen, setComingOpen] = useState(false);
  const scroll = useRef<HTMLDivElement | null>(null);

  const groups = useMemo(
    () => model.groups.filter((g) => g.count > 0 || g.key === "today" || g.key === "comingup"),
    [model.groups],
  );
  const shown = (g: GroupData) => g.dockets.length > 0 && (g.key !== "comingup" || comingOpen);
  const sig = (compact ? "c|" : "") + groups.map((g) => (shown(g) ? g.dockets.map((d) => d.id).join(",") : "")).join("|");
  const visible = useVisibleDockets(scroll, [sig]);

  const span = useMemo(() => {
    const times = groups.filter(shown).flatMap((g) =>
      g.dockets.filter((d) => !visible || visible.has(d.id)).map((d) => d.hm),
    );
    return spanOf(times);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shown` only reads comingOpen
  }, [groups, visible, comingOpen]);

  const flight = useAddFlight(groups, scroll, compact);

  return (
    <section id="todo" className={`todo${compact ? " is-compact" : ""}`} aria-labelledby="todo-title">
      <h2 id="todo-title" className="r-todo-title panel-title">To do</h2>
      <ViewMenu view={view} tags={model.tags} onChange={onView} onSignOut={onSignOut} />
      {span && (
        <p className="r-span span" aria-label={`From ${clock12(span.from)} to ${clock12(span.to)}`}>
          {clock12(span.from)}
          <span className="span-arrow" aria-hidden>→</span>
          {clock12(span.to)}
        </p>
      )}
      <QuickAdd today={today} nowM={nowM} initial={quickAdd} onAdd={onAdd} />
      <NextUp items={model.nextUp} onPlanAll={onPlanAll} />
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
          {groups.map((g) => {
            const open = shown(g);
            const geo: RailGeo = compact ? "compact" : !open ? "slim" : g.dockets.every((d) => d.variant === "carried") ? "carried" : "today";
            return (
              <Rail
                key={g.key}
                label={g.label}
                count={g.count}
                plate={geo === "compact" ? undefined : PLATE[geo]}
                geo={geo}
                toggle={g.key === "comingup" ? { open: comingOpen, onToggle: () => setComingOpen((o) => !o) } : undefined}
              >
                {open && (
                  <SortableContext id={g.key} items={g.dockets.map((d) => d.id)} strategy={compact ? verticalListSortingStrategy : horizontalListSortingStrategy}>
                    {g.dockets.map((d) => (
                      <Docket key={d.id} docket={d} topPick={d.id === model.topPickId} onOpen={onOpen} onTick={onTick} onPlan={onPlan}
                        dnd={dnd ? { manual: view.sort === "manual" } : undefined} compact={compact} arrival={arrivals.get(d.id)} />
                    ))}
                  </SortableContext>
                )}
              </Rail>
            );
          })}
        </m.div>
      </AnimatePresence>
      {flight}
      {legend && (
        <footer className="legend-bar">
          <p className="r-legend legend">
            {legend.hints.map((h) => (
              <span key={h} className="legend-item">{h}<span className="sep" aria-hidden>·</span></span>
            ))}
            <span className="legend-item">
              <CheckIcon size={15} className="legend-tick" />
              {legend.bumpHint}
              <span className="sep" aria-hidden>·</span>
            </span>
            {legend.tail.map((t) => (
              <span key={t} className="legend-item">{t}</span>
            ))}
          </p>
          <p className="r-legend-keys legend-keys">
            <span className="key"><CheckIcon size={22} className="key-tick" />{legend.keys.bumped}</span>
            <span className="key"><span className="key-bang" aria-hidden>!</span>{legend.keys.high}</span>
          </p>
        </footer>
      )}
    </section>
  );
}
