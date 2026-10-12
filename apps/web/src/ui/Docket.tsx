import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import biroRing from "../assets/plates/biro-ring.png";
import docketCarried1 from "../assets/plates/docket-carried-1.png";
import docketCarried2 from "../assets/plates/docket-carried-2.png";
import docketToday1 from "../assets/plates/docket-today-1.png";
import docketToday2 from "../assets/plates/docket-today-2.png";
import docketToday3 from "../assets/plates/docket-today-3.png";
import docketToday4 from "../assets/plates/docket-today-4.png";
import { isOptimistic } from "../lib/useActions";
import { plateIndex } from "./format";
import { CheckIcon } from "./icons";
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

type Props = {
  docket: DocketData;
  topPick?: boolean;
  onOpen?: (id: string) => void;
  onTick?: (id: string, done: boolean) => void;
  onPlan?: (id: string) => void;
  dnd?: { manual: boolean }; // inside a DndProvider: draggable, and sortable while the sort is manual
};

type ViewProps = Props & {
  ghost?: boolean; // the drag overlay and the morph: a picture of the docket, not a second one
  li?: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement> };
  open?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
};

// One paper docket. The plate is chosen by a hash of the task id, so it never changes under the reader.
// The title is the button that opens the edit sheet; its ::after stretches the hit area over the whole docket.
function DocketView({ docket: d, topPick, onOpen, onTick, onPlan, ghost, li, open: openProps }: ViewProps) {
  const busy = isOptimistic(d.id);
  const cls = `docket docket-${d.variant}${d.high ? " is-high" : ""}${d.done ? " is-done" : ""}`;
  const open = (children: React.ReactNode) => (
    <button type="button" className="dk-open" disabled={busy} aria-label={`Edit ${d.title}`} onClick={() => onOpen?.(d.id)}
      tabIndex={ghost ? -1 : undefined} {...openProps}
      // Space picks the docket up (dnd-kit), so it must not also click the button.
      onKeyUp={openProps ? (e) => e.key === " " && e.preventDefault() : undefined}>
      {children}
    </button>
  );
  return (
    <li {...li} className={cls} aria-busy={busy || undefined} aria-hidden={ghost || undefined}
      data-docket={ghost ? undefined : d.id} data-hm={d.hm ?? undefined}>
      <img className="plate" src={PLATES[plateIndex(d.id, PLATES.length)]} alt="" draggable={false} />
      {topPick && <img className="biro-ring" src={biroRing} alt="" draggable={false} data-testid="biro-ring" />}
      <article
        className="dk-print"
        aria-label={d.title}
        onKeyDown={(e) => {
          if (e.key === "x" && !busy && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            onTick?.(d.id, !d.done);
          } else if (e.key === "p" && !busy && !d.done && !e.metaKey && !e.ctrlKey && !e.altKey && onPlan) {
            e.preventDefault();
            onPlan(d.id);
          }
        }}
      >
        {d.variant === "carried" ? (
          <>
            <p className="dk-tag">{d.tag}</p>
            <h4 className="dk-title">{open(d.title)}</h4>
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
              {open(d.lines.map((line, i) => (
                <span key={i} className="dk-title-line">{line}</span>
              )))}
            </h4>
            <p className="dk-source">{d.source}</p>
            <p className="dk-dashes" aria-hidden>{DASHES}</p>
            <Rows rows={d.rows} />
          </>
        )}
        {onTick && (
          <button
            type="button"
            className="dk-bump"
            disabled={busy}
            aria-label={`${d.done ? "Mark not done" : "Mark done"}: ${d.title}`}
            aria-pressed={d.done}
            onClick={() => onTick(d.id, !d.done)}
          >
            <CheckIcon size={20} />
          </button>
        )}
      </article>
    </li>
  );
}

// A docket in a rail: draggable to the line, and sortable among its group while the sort is manual.
function SortableDocket(props: Props) {
  const d = props.docket;
  const busy = isOptimistic(d.id);
  const s = useSortable({ id: d.id, disabled: { draggable: busy, droppable: busy || !props.dnd?.manual } });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(s.transform),
    transition: s.transition,
    ...(s.isDragging ? { opacity: 0.35 } : null),
  };
  const { role: _role, tabIndex: _tab, ...a11y } = s.attributes;
  return (
    <DocketView
      {...props}
      li={{ ref: s.setNodeRef, style, ...s.listeners }}
      open={{
        ref: s.setActivatorNodeRef,
        "aria-roledescription": a11y["aria-roledescription"],
        "aria-describedby": a11y["aria-describedby"],
      }}
    />
  );
}

export function Docket(props: Props) {
  return props.dnd ? <SortableDocket {...props} /> : <DocketView {...props} />;
}

// What the drag overlay and the morph show: the docket as paper, with no handlers.
export function DocketGhost({ docket }: { docket: DocketData }) {
  return <ol className="dk-ghost"><DocketView docket={docket} ghost /></ol>;
}
