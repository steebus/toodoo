import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, m } from "motion/react";
import { RAIL } from "../lib/dnd";
import { useId, type ReactNode } from "react";
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
};

// A ticket rail: label and count, then the dockets standing on it. Dockets wrap onto as many rails as they
// need, one under another, drawn by pass.css under each row. Folded (slim) or as a column of stubs (compact)
// it is a single bar under the label. When a rail above opens or appears, this one slides to its new place.
export function Rail({ label, count, geo, children, toggle, drop }: Props) {
  const id = useId();
  const { setNodeRef, isOver } = useDroppable({ id: `${RAIL}${drop ?? id}`, disabled: !drop });
  return (
    <m.section ref={drop ? setNodeRef : undefined} className={`grp grp-${geo}${drop && isOver ? " is-over" : ""}`}
      aria-labelledby={id} layout="position" layoutDependency={useLayoutDependency()}>
      <div className="grp-head">
        <h3 id={id} className="grp-label rail-label">
          {label.toUpperCase()}
          <span className="count-chip">{count}</span>
        </h3>
        {toggle && (
          <button
            type="button"
            className={`chevron grp-chevron${toggle.open ? " is-open" : ""}`}
            aria-label={`${toggle.open ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-expanded={toggle.open}
            onClick={toggle.onToggle}
          >
            <ChevronIcon />
          </button>
        )}
      </div>
      {(geo === "slim" || geo === "compact") && <span className="rail-bar" aria-hidden />}
      {/* Folding and unfolding: the rows open down from the label (or close up into it). Not on first paint. */}
      <AnimatePresence initial={false}>
        {children && (
          <m.ol key="dockets" className="grp-dockets" layoutScroll
            // Clipped only while it moves, so a tick dashed past a ticket's edge isn't cut off at rest.
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ height: { type: "spring", duration: 0.5, bounce: 0.12 }, opacity: { duration: 0.2 } }}>
            {children}
          </m.ol>
        )}
      </AnimatePresence>
    </m.section>
  );
}
