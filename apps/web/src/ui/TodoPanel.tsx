import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState } from "react";
import { spanOf, type View } from "@shared/board.ts";
import railCarried from "../assets/plates/rail-carried.png";
import railComingup from "../assets/plates/rail-comingup.png";
import railToday from "../assets/plates/rail-today.png";
import type { NewTask } from "../lib/useActions";
import type { PassModel } from "./build";
import { Docket } from "./Docket";
import { clock12 } from "./format";
import { CheckIcon } from "./icons";
import { NextUp } from "./NextUp";
import { QuickAdd } from "./QuickAdd";
import { Rail, type RailGeo } from "./Rail";
import type { GroupData, Legend } from "./types";
import { ViewMenu } from "./ViewMenu";

const PLATE: Record<RailGeo, string> = { carried: railCarried, today: railToday, slim: railComingup };

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
};

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

export function TodoPanel({ model, today, nowM, view, onView, legend, quickAdd, onSignOut, onAdd, onOpen, onTick, onPlan, onPlanAll, dnd }: Props) {
  const [comingOpen, setComingOpen] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => model.groups.filter((g) => g.count > 0 || g.key === "today" || g.key === "comingup"),
    [model.groups],
  );
  const shown = (g: GroupData) => g.dockets.length > 0 && (g.key !== "comingup" || comingOpen);
  const sig = groups.map((g) => (shown(g) ? g.dockets.map((d) => d.id).join(",") : "")).join("|");
  const visible = useVisibleDockets(scroll, [sig]);

  const span = useMemo(() => {
    const times = groups.filter(shown).flatMap((g) =>
      g.dockets.filter((d) => !visible || visible.has(d.id)).map((d) => d.hm),
    );
    return spanOf(times);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shown` only reads comingOpen
  }, [groups, visible, comingOpen]);

  return (
    <section className="todo" aria-labelledby="todo-title">
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
      <div className="todo-scroll" ref={scroll}>
        {groups.map((g) => {
          const open = shown(g);
          const geo: RailGeo = !open ? "slim" : g.dockets.every((d) => d.variant === "carried") ? "carried" : "today";
          return (
            <Rail
              key={g.key}
              label={g.label}
              count={g.count}
              plate={PLATE[geo]}
              geo={geo}
              toggle={g.key === "comingup" ? { open: comingOpen, onToggle: () => setComingOpen((o) => !o) } : undefined}
            >
              {open && (
                <SortableContext id={g.key} items={g.dockets.map((d) => d.id)} strategy={horizontalListSortingStrategy}>
                  {g.dockets.map((d) => (
                    <Docket key={d.id} docket={d} topPick={d.id === model.topPickId} onOpen={onOpen} onTick={onTick} onPlan={onPlan}
                      dnd={dnd ? { manual: view.sort === "manual" } : undefined} />
                  ))}
                </SortableContext>
              )}
            </Rail>
          );
        })}
      </div>
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
