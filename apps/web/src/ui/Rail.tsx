import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, m } from "motion/react";
import { RAIL } from "../lib/dnd";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronIcon } from "./icons";
import { useLayoutDependency } from "./motion";

export type RailGeo = "carried" | "today" | "slim" | "compact";

type Props = {
  label: string;
  count: number;
  geo: RailGeo;
  children?: ReactNode;
  toggle?: { open: boolean; onToggle: () => void };
  drop?: string; // takes dockets dragged from another rail: the group's key
  extra?: ReactNode; // at the head's far right (the top rail carries View)
};

// Where each row of dockets starts, so a rail can be drawn over every row whatever height the row grew to.
function useRowTops(on: boolean, mounted: boolean) {
  const ol = useRef<HTMLOListElement>(null);
  const [tops, setTops] = useState<number[]>([]);
  useEffect(() => {
    const el = ol.current;
    if (!on || !el) return;
    const measure = () => {
      const next = [...new Set([...el.querySelectorAll<HTMLElement>(":scope > [data-docket]")].map((li) => li.offsetTop))];
      setTops((was) => (was.length === next.length && was.every((t, i) => t === next[i]) ? was : next));
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    for (const li of el.children) ro?.observe(li);
    const mo = new MutationObserver(() => { measure(); for (const li of el.children) ro?.observe(li); });
    mo.observe(el, { childList: true });
    return () => { ro?.disconnect(); mo.disconnect(); };
  }, [on, mounted]);
  return [ol, tops] as const;
}

// A ticket rail: label and count, then the dockets standing on it. Dockets wrap onto as many rails as they
// need, one under another, drawn by pass.css under each row. Folded (slim) or as a column of stubs (compact)
// it is a single bar under the label. When a rail above opens or appears, this one slides to its new place.
export function Rail({ label, count, geo, children, toggle, drop, extra }: Props) {
  const id = useId();
  const [ol, tops] = useRowTops(geo === "carried" || geo === "today", !!children);
  const { setNodeRef, isOver } = useDroppable({ id: `${RAIL}${drop ?? id}`, disabled: !drop });
  return (
    <m.section ref={drop ? setNodeRef : undefined} className={`grp grp-${geo}${drop && isOver ? " is-over" : ""}`}
      aria-labelledby={id} layout="position" layoutDependency={useLayoutDependency()}>
      {/* A foldable rail's whole head is its toggle, label to chevron. */}
      <div className={`grp-head${extra ? " has-extra" : ""}`}>
        <h3 id={id} className="grp-label rail-label">
          {toggle ? (
            <button type="button" className="grp-toggle" aria-label={`${toggle.open ? "Hide" : "Show"} ${label.toLowerCase()}`}
              aria-expanded={toggle.open} onClick={toggle.onToggle}>
              {label.toUpperCase()}
              <span className="count-chip">{count}</span>
              <ChevronIcon className={`chevron grp-chevron${toggle.open ? " is-open" : ""}`} />
            </button>
          ) : (
            <>
              {label.toUpperCase()}
              <span className="count-chip">{count}</span>
            </>
          )}
        </h3>
        {extra}
      </div>
      {(geo === "slim" || geo === "compact") && <span className="rail-bar" aria-hidden />}
      {/* Folding and unfolding: the rows open down from the label (or close up into it). Not on first paint. */}
      <AnimatePresence initial={false}>
        {children && (
          <m.ol key="dockets" ref={ol} className={`grp-dockets${geo === "carried" || geo === "today" ? " is-measured" : ""}`} layoutScroll
            // Clipped only while it moves, so a tick dashed past a ticket's edge isn't cut off at rest.
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ height: { type: "spring", duration: 0.5, bounce: 0.12 }, opacity: { duration: 0.2 } }}>
            {tops.map((t) => <li key={t} className="rail-row" aria-hidden style={{ ["--t" as string]: `${t}px` }} />)}
            {children}
          </m.ol>
        )}
      </AnimatePresence>
    </m.section>
  );
}
