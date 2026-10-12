import type { NextUpItem } from "./types";

export function NextUp({ items }: { items: NextUpItem[] }) {
  return (
    <section className="nextup" aria-labelledby="nextup-label">
      <div className="r-nextup-box nextup-box" aria-hidden />
      <h3 id="nextup-label" className="r-nextup-label section-label">NEXT UP</h3>
      <ol className="nextup-list">
        {items.slice(0, 3).map((it, i) => (
          <li key={it.title} className={`r-nextup-${i + 1} nextup-item`}>
            <button type="button" className="nextup-title">{it.title}</button>
            <p className="nextup-why">
              {it.when}
              <span className="sep" aria-hidden>·</span>
              {it.why}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
