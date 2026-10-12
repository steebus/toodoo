import type { CarriedDocket, MetaRow, TodayDocket } from "./types";

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

type Plate = { region: string; plate: string };

export function CarriedTicket({ region, plate, docket }: Plate & { docket: CarriedDocket }) {
  return (
    <li className={`r-${region} docket docket-carried`}>
      <img className="plate" src={plate} alt="" draggable={false} />
      <article className="dk-print" tabIndex={0} aria-label={docket.title}>
        <p className="dk-tag">{docket.tag}</p>
        <h4 className="dk-title">{docket.title}</h4>
        <Rows rows={docket.rows} />
        <p className="dk-dashes" aria-hidden>{DASHES}</p>
        <Rows rows={[docket.footer]} />
      </article>
    </li>
  );
}

export function TodayTicket({ region, plate, docket }: Plate & { docket: TodayDocket }) {
  return (
    <li className={`r-${region} docket docket-today${docket.high ? " is-high" : ""}`}>
      <img className="plate" src={plate} alt="" draggable={false} />
      <article className="dk-print" tabIndex={0} aria-label={docket.title.join(" ")}>
        <p className="dk-head">
          <span className="dk-time">{docket.time}</span>
          <span className="dk-dur">{docket.duration}</span>
        </p>
        <h4 className="dk-title">
          {docket.title.map((line) => (
            <span key={line} className="dk-title-line">{line}</span>
          ))}
        </h4>
        <p className="dk-source">
          {docket.flags ? docket.flags.join(" · ") : (docket.source ?? "")}
        </p>
        <p className="dk-dashes" aria-hidden>{DASHES}</p>
        <Rows rows={docket.rows} />
      </article>
    </li>
  );
}
