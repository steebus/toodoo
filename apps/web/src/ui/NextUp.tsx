import type { NextUpItem } from "./types";

// At the head of the Day plan: the top three to pick from, and Plan all to put them on the line.
export function NextUp({ items, onPlanAll, onOpen }: { items: NextUpItem[]; onPlanAll?: () => void; onOpen?: (id: string) => void }) {
  return (
    <section className="nextup" aria-labelledby="nextup-label">
      <header className="nextup-head">
        <h3 id="nextup-label" className="section-label">NEXT UP</h3>
        <button type="button" className="plan-all" disabled={!onPlanAll || !items.length} onClick={onPlanAll}>Plan all</button>
      </header>
      <ol className="nextup-list">
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
      </ol>
    </section>
  );
}

// How far Next up pushes the line down (pass.css): its frame plus a line per item, and a gap.
export const nextUpHeight = (n: number) => (n ? `calc(${46 + Math.min(n, 3) * 27} * var(--u) + 1.6cqh)` : "0cqh");
