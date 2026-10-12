import biroRing from "../assets/plates/biro-ring.png";
import docketCarried1 from "../assets/plates/docket-carried-1.png";
import docketCarried2 from "../assets/plates/docket-carried-2.png";
import docketToday1 from "../assets/plates/docket-today-1.png";
import docketToday2 from "../assets/plates/docket-today-2.png";
import docketToday3 from "../assets/plates/docket-today-3.png";
import docketToday4 from "../assets/plates/docket-today-4.png";
import { plateIndex } from "./format";
import type { DocketData, MetaRow } from "./types";

const PLATES = [docketCarried1, docketCarried2, docketToday1, docketToday2, docketToday3, docketToday4];
const DASHES = "-".repeat(26);

function Rows({ rows }: { rows: MetaRow[] }) {
  return (
    <dl className="dk-rows">
      {rows.map((r) => (
        <div key={r.label} className="dk-row">
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// One paper docket. The plate is chosen by a hash of the task id, so it never changes under the reader.
export function Docket({ docket: d, topPick }: { docket: DocketData; topPick?: boolean }) {
  const cls = `docket docket-${d.variant}${d.high ? " is-high" : ""}${d.done ? " is-done" : ""}`;
  return (
    <li className={cls} data-docket={d.id} data-hm={d.hm ?? undefined}>
      <img className="plate" src={PLATES[plateIndex(d.id, PLATES.length)]} alt="" draggable={false} />
      {topPick && <img className="biro-ring" src={biroRing} alt="" draggable={false} data-testid="biro-ring" />}
      <article className="dk-print" tabIndex={0} aria-label={d.title}>
        {d.variant === "carried" ? (
          <>
            <p className="dk-tag">{d.tag}</p>
            <h4 className="dk-title">{d.title}</h4>
            <Rows rows={d.rows} />
            <p className="dk-dashes" aria-hidden>{DASHES}</p>
            {d.footer && <Rows rows={[d.footer]} />}
          </>
        ) : (
          <>
            <p className="dk-head">
              <span className="dk-time">{d.time}</span>
              <span className="dk-dur">{d.duration}</span>
            </p>
            <h4 className="dk-title">
              {d.lines.map((line, i) => (
                <span key={i} className="dk-title-line">{line}</span>
              ))}
            </h4>
            <p className="dk-source">{d.source}</p>
            <p className="dk-dashes" aria-hidden>{DASHES}</p>
            <Rows rows={d.rows} />
          </>
        )}
      </article>
    </li>
  );
}
