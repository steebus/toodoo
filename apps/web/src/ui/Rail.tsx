import { m } from "motion/react";
import { useId, type ReactNode } from "react";
import { ChevronIcon } from "./icons";
import { useLayoutDependency } from "./motion";

export type RailGeo = "carried" | "today" | "slim" | "compact";

type Props = {
  label: string;
  count: number;
  plate?: string;
  geo: RailGeo;
  children?: ReactNode;
  toggle?: { open: boolean; onToggle: () => void };
};

// A steel ticket rail: label + count, the rail plate, and the dockets standing in it.
// Dockets that outnumber the rail's width scroll sideways inside it. In Focus (compact) it is a plain
// labelled column. When a rail above opens or appears, this one slides to its new place.
export function Rail({ label, count, plate, geo, children, toggle }: Props) {
  const id = useId();
  return (
    <m.section className={`grp grp-${geo}`} aria-labelledby={id} layout="position" layoutDependency={useLayoutDependency()}>
      <h3 id={id} className="grp-label rail-label">
        {label.toUpperCase()}
        <span className="count-chip">{count}</span>
      </h3>
      {plate && <img className="plate rail-plate" src={plate} alt="" draggable={false} />}
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
      {children && <m.ol className="grp-dockets" layoutScroll>{children}</m.ol>}
    </m.section>
  );
}
