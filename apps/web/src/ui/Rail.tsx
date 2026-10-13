import { m } from "motion/react";
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
};

// A ticket rail: label and count, then the dockets standing on it. Dockets wrap onto as many rails as they
// need, one under another, drawn by pass.css under each row. Folded (slim) or as a column of stubs (compact)
// it is a single bar under the label. When a rail above opens or appears, this one slides to its new place.
export function Rail({ label, count, geo, children, toggle }: Props) {
  const id = useId();
  return (
    <m.section className={`grp grp-${geo}`} aria-labelledby={id} layout="position" layoutDependency={useLayoutDependency()}>
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
      {children && <m.ol className="grp-dockets" layoutScroll>{children}</m.ol>}
    </m.section>
  );
}
