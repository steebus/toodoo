import type { ReactNode } from "react";

type Props = {
  id: string;
  label: string;
  count: number;
  plate: string;
  children?: ReactNode;
};

// A steel ticket rail: label + count, the rail plate, and the dockets standing in it.
export function Rail({ id, label, count, plate, children }: Props) {
  return (
    <section className={`rail rail-${id}`} aria-labelledby={`${id}-label`}>
      <h3 id={`${id}-label`} className={`r-${id}-label rail-label`}>
        {label}
        <span className="count-chip">{count}</span>
      </h3>
      <img className={`r-rail-${id} plate rail-plate`} src={plate} alt="" draggable={false} />
      {children && <ol className="rail-dockets">{children}</ol>}
    </section>
  );
}
