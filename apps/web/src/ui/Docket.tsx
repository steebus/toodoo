import { useIsOffline } from "../lib/offline";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { m } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type Ref } from "react";
import biroRing from "../assets/plates/biro-ring.webp";
import { isOptimistic } from "../lib/useActions";
import { BlockedIcon, PenLoop, PenProgress, PenTick } from "./icons";
import { reducedMotion, useLayoutDependency } from "./motion";
import { Swipe } from "./Swipe";
import type { DocketData, MetaRow } from "./types";

// A keyboard drag starts and ends on Space, and a button also clicks on Space keyup: the DndProvider stamps
// this when a keyboard drag begins, ends or is cancelled, and the click that follows it is ignored.
export const keyDrag = { at: 0 };
const afterKeyDrag = (e: React.MouseEvent) => e.detail === 0 && Date.now() - keyDrag.at < 400;

const DASHES = "-".repeat(60); // cut to the paper's width by CSS

// A docket ticked on this device moves to Done today as a new element; it draws its tick there on arrival.
const ticked = new Map<string, number>();
const tickedJustNow = (id: string) => Date.now() - (ticked.get(id) ?? 0) < 600;
// Ticked here, it holds its place while the pen draws the tick, then goes.
const TICK_HOLD = 380;

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
  dnd?: { manual: boolean; moves?: boolean }; // in a DndProvider: draggable, sortable while the sort is manual, movable between status rails
  compact?: boolean; // Focus: a one-line stub in a narrow column instead of the paper docket
  arrival?: number; // just arrived from elsewhere: prints in, this many places into the stagger
  inflight?: boolean; // its picture is still flying in from the quick add: hidden until it lands
  swipe?: { onTomorrow?: (id: string) => void }; // on the phone: swipe right to bump, left for Plan / Tomorrow
};

type ViewProps = Props & {
  ghost?: boolean; // the drag overlay and the morph: a picture of the docket, not a second one
  held?: boolean; // dnd-kit is carrying it
  li?: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement> };
  open?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
};

// One paper docket, drawn in CSS (pass.css): paper that never inverts, a perforated top, live print.
// The title is the button that opens the edit sheet; its ::after stretches the hit area over the whole docket.
// The paper (plate and print) is one motion layer: when the docket changes rail (bumped into Done today)
// it travels there, and its neighbours close up behind it. The li stays dnd-kit's alone.
function DocketView({ docket: d, topPick, onOpen, onTick, onPlan, ghost, li, open: openProps, compact, arrival, inflight, swipe, held = false }: ViewProps) {
  const offline = useIsOffline();
  const busy = isOptimistic(d.id);
  const layoutDependency = useLayoutDependency();
  const [drawTick] = useState(() => d.done && !ghost && tickedJustNow(d.id));
  const [inked, setInked] = useState(false); // ticked, the tick drawing, not yet sent
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; send: () => void } | null>(null);
  useEffect(() => () => { // leaving mid-draw still sends the tick: never lose it
    const h = hold.current;
    if (h) { clearTimeout(h.timer); h.send(); }
  }, []);
  const tick = (done: boolean) => {
    if (offline || hold.current) return;
    const send = () => {
      hold.current = null;
      if (done) ticked.set(d.id, Date.now());
      onTick?.(d.id, done);
      if (onTick && !ghost) focusAfterTick(d.id, done);
    };
    if (!done || ghost || reducedMotion()) return send();
    setInked(true);
    hold.current = { timer: setTimeout(() => { send(); setInked(false); }, TICK_HOLD), send };
  };
  const done = d.done || inked;
  const cls = `docket docket-${d.variant} fit-${d.fit ?? 0}${compact ? " docket-compact" : ""}${d.high ? " is-high" : ""}${d.blocked ? " is-blocked" : ""}${d.done ? " is-done" : ""}${arrival !== undefined ? " is-arrived" : ""}${inflight ? " is-inflight" : ""}${d.colour ? " has-epic" : ""}`;
  const open = (children: React.ReactNode) => (
    <button type="button" className="dk-open" disabled={busy} aria-label={`Open ${d.title}`} onClick={(e) => !afterKeyDrag(e) && onOpen?.(d.id)}
      tabIndex={ghost ? -1 : undefined} {...openProps}
      onKeyDown={(e) => e.key !== " " && (keyDrag.at = 0)}>
      {children}
    </button>
  );
  const wrap = (paper: React.ReactNode) => !swipe || !onTick || ghost ? paper : (
    <Swipe held={held} disabled={busy || offline} onTick={() => tick(!d.done)}
      onPlan={onPlan && !d.done ? () => onPlan(d.id) : undefined}
      onTomorrow={swipe.onTomorrow && !d.done ? () => swipe.onTomorrow!(d.id) : undefined}>
      {paper}
    </Swipe>
  );
  return (
    <li {...li} className={cls} aria-busy={busy || undefined} aria-hidden={ghost || undefined}
      data-docket={ghost ? undefined : d.id} data-hm={d.hm ?? undefined}
      style={{
        ...li?.style,
        ...(arrival !== undefined ? { ["--i" as string]: arrival } : null),
        ...(d.colour ? { ["--epic" as string]: `var(--epic-${d.colour})` } : null),
      }}>
      {wrap(<m.div className="dk-paper" layoutId={ghost ? undefined : `${compact ? "stub" : "docket"}:${d.id}`} layoutDependency={layoutDependency}>
        {/* On a stub the ring shows only on the phone (pass.css). */}
        {topPick && <img className="biro-ring" src={biroRing} alt="" draggable={false} data-testid="biro-ring" />}
        <article
          className="dk-print"
          aria-label={d.title}
          onKeyDown={(e) => {
            if (e.key === "x" && !busy && !offline && !e.metaKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              tick(!d.done);
            } else if (e.key === "p" && !busy && !d.done && !e.metaKey && !e.ctrlKey && !e.altKey && onPlan) {
              e.preventDefault();
              onPlan(d.id);
            }
          }}
        >
          {!compact && d.epic && <span className="dk-epic" title={d.epic}>{d.epic}</span>}
          {compact ? (
            <>
              <span className={d.variant === "carried" ? "dk-stub-tag" : "dk-time"}>{d.variant === "carried" ? d.tag : d.time}</span>
              <h4 className="dk-title">{d.blocked && <BlockedIcon size={14} className="dk-blocked-icon" />}{open(<span className="dk-title-text">{d.title}</span>)}</h4>
              {d.list && <span className="dk-list" aria-label={`Checklist ${d.list.done} of ${d.list.total}`}>{d.list.done}/{d.list.total}</span>}
              <span className="dk-dur">{d.duration}</span>
              {d.progress && <PenProgress {...d.progress} className="dk-progress" />}
            </>
          ) : d.variant === "carried" ? (
            <>
              <p className="dk-tag">{d.tag}{d.blocked && <span className="dk-blocked"><BlockedIcon size={14} />BLOCKED</span>}{d.duration && <span className="dk-dur">{d.duration}</span>}</p>
              <h4 className="dk-title">{open(<span className="dk-title-text">{d.title}</span>)}</h4>
              {d.note && <p className="dk-note">{d.note}</p>}
              <Rows rows={d.rows} />
              <p className="dk-dashes" aria-hidden>{DASHES}</p>
              {d.footer && <Rows rows={[d.footer]} />}
              {d.progress && <PenProgress {...d.progress} className="dk-progress" />}
            </>
          ) : (
            <>
              <p className="dk-head">
                <span className="dk-time">{d.time}</span>
                {d.blocked && <span className="dk-blocked"><BlockedIcon size={14} />BLOCKED</span>}
                <span className="dk-dur">{d.duration}</span>
              </p>
              <h4 className="dk-title">{open(<span className="dk-title-text">{d.title}</span>)}</h4>
              {d.note && <p className="dk-note">{d.note}</p>}
              {d.source && <p className="dk-source">{d.source}</p>}
              <p className="dk-dashes" aria-hidden>{DASHES}</p>
              <Rows rows={d.rows} />
              {d.progress && <PenProgress {...d.progress} className="dk-progress" />}
            </>
          )}
          {onTick && (
            <button
              type="button"
              className="dk-bump"
              disabled={busy || offline}
              aria-label={`${d.done ? "Mark not done" : "Mark done"}: ${d.title}`}
              aria-pressed={d.done}
              onClick={() => tick(!d.done)}
            >
              {/* In pen: a loop waiting to be ticked, then a scrawled tick. */}
              {!done && <PenLoop className="dk-loop" />}
              <PenTick on={done} draw={drawTick} className="dk-tick" />
            </button>
          )}
        </article>
      </m.div>)}
    </li>
  );
}

// A docket in a rail: draggable to the line, and sortable among its group while the sort is manual.
function SortableDocket(props: Props) {
  const d = props.docket;
  const busy = isOptimistic(d.id);
  const offline = useIsOffline();
  // Done dockets drag too (back to Today, or on to Coming up); a docket takes drops to be moved in before it.
  const s = useSortable({ id: d.id, disabled: { draggable: busy || offline, droppable: busy || (!props.dnd?.manual && !props.dnd?.moves) } });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(s.transform),
    transition: s.transition,
    ...(s.isDragging ? { opacity: 0.35 } : null),
  };
  const { role: _role, tabIndex: _tab, ...a11y } = s.attributes;
  return (
    <DocketView
      {...props}
      held={s.isDragging}
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
