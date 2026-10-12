import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { m } from "motion/react";
import { useState, type CSSProperties, type HTMLAttributes, type Ref } from "react";
import biroRing from "../assets/plates/biro-ring.webp";
import docketCarried1 from "../assets/plates/docket-carried-1.webp";
import docketCarried2 from "../assets/plates/docket-carried-2.webp";
import docketToday1 from "../assets/plates/docket-today-1.webp";
import docketToday2 from "../assets/plates/docket-today-2.webp";
import docketToday3 from "../assets/plates/docket-today-3.webp";
import docketToday4 from "../assets/plates/docket-today-4.webp";
import { isOptimistic } from "../lib/useActions";
import { plateIndex } from "./format";
import { DrawnCheck } from "./icons";
import { useLayoutDependency } from "./motion";
import type { DocketData, MetaRow } from "./types";

const PLATES = [docketCarried1, docketCarried2, docketToday1, docketToday2, docketToday3, docketToday4];
// A keyboard drag starts and ends on Space, and a button also clicks on Space keyup: the DndProvider stamps
// this when a keyboard drag begins, ends or is cancelled, and the click that follows it is ignored.
export const keyDrag = { at: 0 };
const afterKeyDrag = (e: React.MouseEvent) => e.detail === 0 && Date.now() - keyDrag.at < 400;

const DASHES = "-".repeat(26);

// A docket ticked on this device moves to Done today as a new element; it draws its tick there on arrival.
const ticked = new Map<string, number>();
const tickedJustNow = (id: string) => Date.now() - (ticked.get(id) ?? 0) < 600;

// A ticked docket leaves its rail, so focus would fall to the page. It goes on to the next open docket
// instead, or (none left, or reopening) follows the ticked docket to its new place.
function focusAfterTick(id: string, done: boolean) {
  const open = [...document.querySelectorAll<HTMLElement>(".pass .todo-scroll [data-docket]:not(.is-done)")].map((e) => e.dataset.docket!);
  const next = done ? open[open.indexOf(id) + 1] : undefined;
  const want = next ?? id;
  const doneThere = next ? false : done; // wait for the board to show the docket in its new state
  let frames = 0;
  const go = () => {
    const li = [...document.querySelectorAll<HTMLElement>(".pass .todo-scroll [data-docket]")].find((e) => e.dataset.docket === want);
    if (li && li.classList.contains("is-done") === doneThere) return li.querySelector<HTMLElement>(".dk-open")?.focus();
    if (++frames < 30) requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
}

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
  compact?: boolean; // Focus: a one-line stub in a narrow column instead of the paper docket
  arrival?: number; // just arrived from elsewhere: prints in, this many places into the stagger
  inflight?: boolean; // its picture is still flying in from the quick add: hidden until it lands
};

type ViewProps = Props & {
  ghost?: boolean; // the drag overlay and the morph: a picture of the docket, not a second one
  li?: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement> };
  open?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
};

// One paper docket. The plate is chosen by a hash of the task id, so it never changes under the reader.
// The title is the button that opens the edit sheet; its ::after stretches the hit area over the whole docket.
// The paper (plate and print) is one motion layer: when the docket changes rail (bumped into Done today)
// it travels there, and its neighbours close up behind it. The li stays dnd-kit's alone.
function DocketView({ docket: d, topPick, onOpen, onTick, onPlan, ghost, li, open: openProps, compact, arrival, inflight }: ViewProps) {
  const busy = isOptimistic(d.id);
  const layoutDependency = useLayoutDependency();
  const [drawTick] = useState(() => d.done && !ghost && tickedJustNow(d.id));
  const tick = (done: boolean) => {
    if (done) ticked.set(d.id, Date.now());
    onTick?.(d.id, done);
    if (onTick && !ghost) focusAfterTick(d.id, done);
  };
  const cls = `docket docket-${d.variant}${compact ? " docket-compact" : ""}${d.high ? " is-high" : ""}${d.done ? " is-done" : ""}${arrival !== undefined ? " is-arrived" : ""}${inflight ? " is-inflight" : ""}`;
  const open = (children: React.ReactNode) => (
    <button type="button" className="dk-open" disabled={busy} aria-label={`Edit ${d.title}`} onClick={(e) => !afterKeyDrag(e) && onOpen?.(d.id)}
      tabIndex={ghost ? -1 : undefined} {...openProps}
      onKeyDown={(e) => e.key !== " " && (keyDrag.at = 0)}>
      {children}
    </button>
  );
  return (
    <li {...li} className={cls} aria-busy={busy || undefined} aria-hidden={ghost || undefined}
      data-docket={ghost ? undefined : d.id} data-hm={d.hm ?? undefined}
      style={arrival !== undefined ? { ...li?.style, ["--i" as string]: arrival } : li?.style}>
      <m.div className="dk-paper" layoutId={ghost ? undefined : `${compact ? "stub" : "docket"}:${d.id}`} layoutDependency={layoutDependency}>
        {!compact && <img className="plate" src={PLATES[plateIndex(d.id, PLATES.length)]} alt="" draggable={false} />}
        {topPick && !compact && <img className="biro-ring" src={biroRing} alt="" draggable={false} data-testid="biro-ring" />}
        <article
          className="dk-print"
          aria-label={d.title}
          onKeyDown={(e) => {
            if (e.key === "x" && !busy && !e.metaKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              tick(!d.done);
            } else if (e.key === "p" && !busy && !d.done && !e.metaKey && !e.ctrlKey && !e.altKey && onPlan) {
              e.preventDefault();
              onPlan(d.id);
            }
          }}
        >
          {compact ? (
            <>
              <span className={d.variant === "carried" ? "dk-stub-tag" : "dk-time"}>{d.variant === "carried" ? "CARRIED" : d.time}</span>
              <h4 className="dk-title">{open(d.title)}</h4>
              <span className="dk-dur">{d.duration}</span>
            </>
          ) : d.variant === "carried" ? (
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
              onClick={() => tick(!d.done)}
            >
              <DrawnCheck on={d.done} draw={drawTick} size={compact ? 16 : 20} />
            </button>
          )}
        </article>
      </m.div>
    </li>
  );
}

// A docket in a rail: draggable to the line, and sortable among its group while the sort is manual.
function SortableDocket(props: Props) {
  const d = props.docket;
  const busy = isOptimistic(d.id);
  const s = useSortable({ id: d.id, disabled: { draggable: busy || d.done, droppable: busy || d.done || !props.dnd?.manual } });
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
        // Announced as a plain button unless it can actually be sorted.
        ...(props.dnd?.manual && !d.done ? { "aria-roledescription": a11y["aria-roledescription"] } : null),
        "aria-describedby": a11y["aria-describedby"],
      }}
    />
  );
}

export function Docket(props: Props) {
  return props.dnd ? <SortableDocket {...props} /> : <DocketView {...props} />;
}

// What the drag overlay and the morph show: the docket as paper, with no handlers.
export function DocketGhost({ docket, compact }: { docket: DocketData; compact?: boolean }) {
  return <ol className="dk-ghost"><DocketView docket={docket} compact={compact} ghost /></ol>;
}
