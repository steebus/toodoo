import { ChevronIcon } from "./icons";
import type { NextUpItem } from "./types";

type Props = { items: NextUpItem[]; onPlanAll?: () => void; onOpen?: (id: string) => void; open?: boolean; onToggle?: () => void };

// At the head of the Day plan: the top three to pick from, and Plan all to put them on the line. Its label folds it.
export function NextUp({ items, onPlanAll, onOpen, open = true, onToggle }: Props) {
  return (
    <section className={`nextup${open ? "" : " is-folded"}`} aria-labelledby="nextup-label">
      <header className="nextup-head">
        <h3 id="nextup-label" className="section-label">
          <button type="button" className="nextup-toggle" aria-expanded={open} onClick={onToggle} disabled={!onToggle}>
            NEXT UP
            <ChevronIcon size={16} className={`nextup-chevron${open ? " is-open" : ""}`} />
          </button>
        </h3>
        <button type="button" className="plan-all" disabled={!onPlanAll || !items.length} onClick={onPlanAll}>Plan all</button>
      </header>
      {open && <ol className="nextup-list">
        {items.slice(0, 3).map((it) => (
          <li key={it.id} className="nextup-item">
            <button type="button" className="nextup-title" onClick={() => onOpen?.(it.id)}>{it.title}</button>
            <p className="nextup-why">
              {it.when}
              {it.why && (
                <>
                  <span className="sep" aria-hidden>·</span>
                  {it.why}
                </>
              )}
            </p>
          </li>
        ))}
      </ol>}
    </section>
  );
}

// How far Next up pushes the line down (pass.css): its frame plus a line per item (none folded), and a gap.
export const nextUpHeight = (n: number, open = true) =>
  (n ? `calc(${(open ? 46 + Math.min(n, 3) * 27 : 40)} * var(--u) + 1.6cqh)` : "0cqh");
