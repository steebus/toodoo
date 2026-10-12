import biroRing from "../assets/plates/biro-ring.png";
import docketCarried1 from "../assets/plates/docket-carried-1.png";
import docketCarried2 from "../assets/plates/docket-carried-2.png";
import docketToday1 from "../assets/plates/docket-today-1.png";
import docketToday2 from "../assets/plates/docket-today-2.png";
import docketToday3 from "../assets/plates/docket-today-3.png";
import docketToday4 from "../assets/plates/docket-today-4.png";
import railCarried from "../assets/plates/rail-carried.png";
import railComingup from "../assets/plates/rail-comingup.png";
import railToday from "../assets/plates/rail-today.png";
import { CarriedTicket, TodayTicket } from "./Docket";
import { CheckIcon, ChevronIcon } from "./icons";
import { NextUp } from "./NextUp";
import { QuickAdd } from "./QuickAdd";
import { Rail } from "./Rail";
import type { HeroData } from "./types";

const CARRIED_PLATES = [docketCarried1, docketCarried2];
const TODAY_PLATES = [docketToday1, docketToday2, docketToday3, docketToday4];

type Props = Omit<HeroData, "date" | "headline" | "done" | "total" | "presets" | "activePreset" | "hours" | "now" | "blocks">;

export function TodoPanel({ span, quickAdd, chips, nextUp, carried, today, comingUp, legend }: Props) {
  return (
    <section className="todo" aria-labelledby="todo-title">
      <h2 id="todo-title" className="r-todo-title panel-title">To do</h2>
      <p className="r-span span" aria-label={`From ${span.from} to ${span.to}`}>
        {span.from}
        <span className="span-arrow" aria-hidden>→</span>
        {span.to}
      </p>
      <QuickAdd quickAdd={quickAdd} chips={chips} />
      <NextUp items={nextUp} />
      <Rail id="carried" label="CARRIED OVER" count={carried.length} plate={railCarried}>
        {carried.slice(0, 2).map((d, i) => (
          <CarriedTicket key={d.title} region={`docket-carried-${i + 1}`} plate={CARRIED_PLATES[i]} docket={d} />
        ))}
      </Rail>
      <Rail id="today" label="TODAY" count={today.length} plate={railToday}>
        {today.slice(0, 4).map((d, i) => (
          <TodayTicket key={d.title.join(" ")} region={`docket-today-${i + 1}`} plate={TODAY_PLATES[i]} docket={d} />
        ))}
      </Rail>
      {today.some((d) => d.topPick) && <img className="r-biro-ring plate biro-ring" src={biroRing} alt="" draggable={false} />}
      <Rail id="comingup" label="COMING UP" count={comingUp} plate={railComingup} />
      <button type="button" className="r-comingup-chevron chevron" aria-label="Show coming up" aria-expanded={false}>
        <ChevronIcon />
      </button>
      {legend && (
        <footer className="legend-bar">
          <p className="r-legend legend">
            {legend.hints.map((h) => (
              <span key={h} className="legend-item">{h}<span className="sep" aria-hidden>·</span></span>
            ))}
            <span className="legend-item">
              <CheckIcon size={15} className="legend-tick" />
              {legend.bumpHint}
              <span className="sep" aria-hidden>·</span>
            </span>
            {legend.tail.map((t) => (
              <span key={t} className="legend-item">{t}</span>
            ))}
          </p>
          <p className="r-legend-keys legend-keys">
            <span className="key"><CheckIcon size={22} className="key-tick" />{legend.keys.bumped}</span>
            <span className="key"><span className="key-bang" aria-hidden>!</span>{legend.keys.high}</span>
          </p>
        </footer>
      )}
    </section>
  );
}
