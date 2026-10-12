import { useId, type ReactNode } from "react";
import { ChevronIcon } from "./icons";

export type RailGeo = "carried" | "today" | "slim";

type Props = {
  label: string;
  count: number;
  plate: string;
  geo: RailGeo;
  children?: ReactNode;
  toggle?: { open: boolean; onToggle: () => void };
};

// A steel ticket rail: label + count, the rail plate, and the dockets standing in it.
// Dockets that outnumber the rail's width scroll sideways inside it.
export function Rail({ label, count, plate, geo, children, toggle }: Props) {
  const id = useId();
  return (
    <section className={`grp grp-${geo}`} aria-labelledby={id}>
      <h3 id={id} className="grp-label rail-label">
        {label.toUpperCase()}
        <span className="count-chip">{count}</span>
      </h3>
      <img className="plate rail-plate" src={plate} alt="" draggable={false} />
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
      {children && <ol className="grp-dockets">{children}</ol>}
    </section>
  );
}
