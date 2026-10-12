import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { m } from "motion/react";
import { layoutLanes, SNAP, toHM } from "@shared/planning.ts";
import { TIMELINE } from "../lib/dnd";
import { isOptimistic, type Actions } from "../lib/useActions";
import { clampBlock, deltaMin, hitSlot, moveBlock, widenRange, type Placed } from "../lib/timeline";
import { useIsOffline } from "../lib/offline";
import { useDropHint } from "./DndProvider";
import { clock12, hourLabel } from "./format";
import { CheckIcon, DrawnCheck, NowMarker } from "./icons";
import { SNAPPY, useLayoutDependency } from "./motion";
import { BLOCK_LEAD, blockHeight, blockTop, gridHeight, HOUR_PX, LINE_DROP, minToPx, NOW_LEAD } from "./plan";
import { SlotPicker } from "./SlotPicker";
import type { BoardData, PlanBlock, PlanData } from "./types";

const KEY_IDLE = 400; // arrow presses batch into one save after this pause
const DRAG_SLOP = 4;
const DAY = 24 * 60;

type Draft = { id: string; start: number; mins: number; via: "key" | "pointer" };
type Drag = { id: string; y0: number; start: number; mins: number; mode: "move" | "resize"; moved: boolean };

const clockOf = (m: number) => (m >= DAY ? "12:00" : clock12(toHM(m)));
const range = (s: number, mins: number) => `${clockOf(s)}–${clockOf(s + mins)}`;

type Props = { plan: PlanData; board?: BoardData; actions?: Actions };

// The line: hour grid, events and planned blocks. With actions, blocks drag (body moves, bottom edge
// resizes) and take arrow keys; an empty slot opens the SlotPicker. Without (fixture), it only draws.
export function Timeline({ plan, board, actions }: Props) {
  const { blocks, nowM, anchorM } = plan;
  const date = board?.date ?? "";
  const live = !!(actions && board);
  const offline = useIsOffline();
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraft = (d: Draft | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const drag = useRef<Drag | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refocus = useRef<string | null>(null);
  const swallowClick = useRef(false);
  const hint = useDropHint();
  const [cursor, setCursor] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  // Blocks, the drag ghost and the drop hint spring between 15-minute slots instead of jumping.
  const layoutDependency = useLayoutDependency();
  const glide = { layout: "position" as const, transition: SNAPPY };
  const snap = { ...glide, layoutDependency }; // blocks hold still while the divider is dragged

  // Keyboard drafts may run past the drawn hours, so widen to fit; a pointer drag keeps the grid still under the hand.
  const { startM, endM } = useMemo(
    () => (draft?.via === "key" ? widenRange(plan.startM, plan.endM, [{ s: draft.start, e: draft.start + draft.mins }]) : plan),
    [plan, draft],
  );

  // The visible line is the drop target; the grid inside it says where minutes are.
  const drop = useDroppable({
    id: TIMELINE,
    disabled: !live || offline,
    data: { gridTop: () => grid.current?.getBoundingClientRect().top ?? 0, startM, endM },
  });

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, minToPx(anchorM, startM) - 140);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps -- open scrolled to the day's anchor, then leave the scroll alone

  // A keyboard batch waiting on its idle timer. It is saved early rather than dropped: before a batch starts on
  // another block, when the line unmounts, and when the page is hidden.
  // It remembers the day and block it started on: navigating away within the pause must not move the write.
  type Pending = { id: string; date: string; was: { start: number; mins: number }; start: number; mins: number };
  const pending = useRef<Pending | null>(null);
  const commitRef = useRef<(id: string, next: { start: number; mins: number }, at?: { date: string; was: Placed }) => void>(() => {});
  const flush = () => {
    clearTimeout(keyTimer.current);
    const p = pending.current;
    pending.current = null;
    if (p) commitRef.current(p.id, p, { date: p.date, was: p.was });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const onHide = () => flushRef.current();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushRef.current();
    };
  }, []);

  // Escape abandons a pointer drag: no write, no ghost.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || !drag.current) return;
      drag.current = null;
      swallowClick.current = true;
      if (draftRef.current?.via === "pointer") setDraft(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- refs only

  // A keyed block can change DOM position when it re-sorts after a save; keep focus on it.
  useLayoutEffect(() => {
    const id = refocus.current;
    if (!id) return;
    const el = grid.current?.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"] .plan-body`);
    if (el && document.activeElement !== el) el.focus();
  });

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = startM; m <= endM; m += 60) out.push(m);
    return out;
  }, [startM, endM]);

  const at = (b: PlanBlock) => (draft?.id === b.id && draft.via === "key" ? { start: draft.start, mins: draft.mins } : { start: b.startM, mins: b.mins });
  const lanes = useMemo(() => {
    const laid = layoutLanes(blocks.map((b) => {
      const p = at(b);
      return { ...b, startM: p.start, mins: p.mins, s: p.start, e: p.start + p.mins };
    }));
    const byId = new Map(laid.map((b) => [b.id, b]));
    return blocks.map((b) => byId.get(b.id)!); // stable DOM order, so a moving block keeps focus
  }, [blocks, draft]); // eslint-disable-line react-hooks/exhaustive-deps -- `at` reads draft

  const commit = (id: string, next: { start: number; mins: number }, at?: { date: string; was: Placed }) => {
    setDraft(null);
    const b = blocks.find((x) => x.id === id);
    const was = at?.was ?? (b && { start: b.startM, mins: b.mins });
    if (!was || !actions || (was.start === next.start && was.mins === next.mins)) return;
    refocus.current = document.activeElement?.closest(`[data-block]`)?.getAttribute("data-block") === id ? id : null;
    actions.place(id, at?.date ?? date, next.start, next.mins);
  };
  commitRef.current = commit;

  const onBlockKey = (e: KeyboardEvent, b: PlanBlock) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (offline) return;
    if (pending.current && (pending.current.id !== b.id || pending.current.date !== date)) flush();
    const step = e.key === "ArrowUp" ? -SNAP : SNAP;
    const cur = draftRef.current?.id === b.id ? draftRef.current : { start: b.startM, mins: b.mins };
    const next = e.shiftKey ? clampBlock(cur.start, cur.mins + step) : moveBlock(cur.start + step, cur.mins);
    setDraft({ id: b.id, ...next, via: "key" });
    clearTimeout(keyTimer.current);
    pending.current = { id: b.id, date, was: pending.current?.was ?? { start: b.startM, mins: b.mins }, ...next };
    keyTimer.current = setTimeout(flush, KEY_IDLE);
  };

  const dragTo = (y: number) => {
    const d = drag.current!;
    const dm = deltaMin(y - d.y0);
    return d.mode === "move" ? moveBlock(d.start + dm, d.mins) : clampBlock(d.start, d.mins + dm);
  };
  const pointer = (b: PlanBlock, mode: Drag["mode"]) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (offline || e.button !== 0 || draftRef.current?.via === "key") return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { id: b.id, y0: e.clientY, start: b.startM, mins: b.mins, mode, moved: false };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== b.id) return;
      if (!d.moved && Math.abs(e.clientY - d.y0) < DRAG_SLOP) return;
      d.moved = true;
      const next = dragTo(e.clientY);
      const cur = draftRef.current;
      if (!cur || cur.start !== next.start || cur.mins !== next.mins) setDraft({ id: b.id, ...next, via: "pointer" });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== b.id) return;
      const next = d.moved ? dragTo(e.clientY) : null;
      drag.current = null;
      if (!next) return;
      swallowClick.current = true;
      commit(b.id, next);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDraft(null);
    },
    onLostPointerCapture: () => {
      if (drag.current?.id === b.id) {
        drag.current = null;
        setDraft(null);
      }
    },
  });

  // The free-time surface: one tab stop; arrows move a slot cursor, Enter opens the picker there.
  const defaultSlot = () => Math.min(DAY - SNAP, nowM !== null ? Math.ceil(nowM / SNAP) * SNAP : Math.max(startM, 9 * 60));
  const moveCursor = (m: number) => {
    const c = Math.max(0, Math.min(DAY - SNAP, m));
    setCursor(c);
    const sc = scroller.current;
    if (sc) {
      const top = blockTop(c, startM);
      if (top < sc.scrollTop) sc.scrollTop = top - 8;
      else if (top + 40 > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + 48 - sc.clientHeight;
    }
  };
  const onSlotsKey = (e: KeyboardEvent) => {
    const c = cursor ?? defaultSlot();
    const steps: Record<string, number> = { ArrowUp: -SNAP, ArrowDown: SNAP, PageUp: -60, PageDown: 60 };
    if (e.key in steps) moveCursor(c + steps[e.key]);
    else if (e.key === "Home") moveCursor(startM);
    else if (e.key === "End") moveCursor(endM - SNAP);
    else if (e.key === "Enter" || e.key === " ") offline || setPicker(c);
    else return;
    e.preventDefault();
  };

  const ghost = draft?.via === "pointer" ? draft : null;
  const slotTop = (m: number) => blockTop(m, startM);
  const pickerTop = (m: number) => {
    const below = slotTop(m) + 44;
    return below + 330 > gridHeight(startM, endM) ? Math.max(0, slotTop(m) - 336) : below;
  };

  return (
    <m.div className="plan-scroll" layoutScroll ref={(n: HTMLDivElement | null) => { scroller.current = n; drop.setNodeRef(n); }}>
      <div className="plan-grid" ref={grid} style={{ height: gridHeight(startM, endM) }}>
        {live && (
          <div
            className="plan-slots"
            role="group"
            aria-label="Free time"
            tabIndex={0}
            onFocus={() => cursor === null && setCursor(defaultSlot())}
            onBlur={() => picker === null && setCursor(null)}
            onKeyDown={onSlotsKey}
            onClick={(e) => {
              if (offline || e.target !== e.currentTarget) return;
              const m = hitSlot(e.clientY - e.currentTarget.getBoundingClientRect().top, startM);
              setCursor(m);
              setPicker(m);
            }}
          />
        )}
        {live && cursor !== null && (
          <span className="plan-cursor" aria-hidden style={{ top: slotTop(cursor), height: (SNAP * HOUR_PX) / 60 + BLOCK_LEAD / 2 }}>
            <span className="plan-cursor-time">{clockOf(cursor)}</span>
          </span>
        )}
        <p className="sr-only" aria-live="polite">{cursor !== null && picker === null ? clockOf(cursor) : ""}</p>
        <div className="hour-lines" aria-hidden>
          {hours.map((m) => (
            <span key={m} className="hour-line" style={{ top: minToPx(m, startM) + LINE_DROP }} />
          ))}
        </div>
        <ol className="hour-labels" aria-label="Hours">
          {hours.map((m) => (
            <li key={m} className="hour-label" style={{ top: minToPx(m, startM) }}>
              {hourLabel(m / 60)}
            </li>
          ))}
        </ol>
        <ol className="plan-blocks" aria-label="Plan">
          {lanes.map((b) => {
            const editable = live && b.kind === "task" && !isOptimistic(b.id);
            const dragging = ghost?.id === b.id;
            const shownAt = at(b);
            const time = shownAt.start === b.startM ? b.time : clockOf(shownAt.start);
            const cls = `plan-block plan-${b.kind}${b.current ? " is-current" : ""}${b.done ? " is-done" : ""}${editable ? " is-live" : ""}${offline ? " is-offline" : ""}${dragging ? " is-lifted" : ""}${draft?.id === b.id && draft.via === "key" ? " is-keyed" : ""}`;
            const style = {
              top: blockTop(b.startM, startM),
              height: blockHeight(b.mins),
              left: `calc(var(--lane-left) + ${b.col} * var(--lane-w) / ${b.cols})`,
              width: `calc(var(--lane-w) / ${b.cols}${b.cols > 1 ? " - 0.3cqw" : ""})`,
            };
            const face = (
              <>
                <span className="plan-time">{time}</span>
                <span className="plan-title">
                  {b.title}
                  {b.duration && (
                    <>
                      <span className="sep" aria-hidden>·</span>
                      {shownAt.mins === b.mins ? b.duration : `${shownAt.mins}m`}
                    </>
                  )}
                </span>
              </>
            );
            if (!editable) return <m.li key={b.id} className={cls} style={style} {...snap}>{face}</m.li>;
            return (
              <m.li key={b.id} data-block={b.id} className={cls} style={style} {...snap}>
                <button
                  type="button"
                  className="plan-body"
                  aria-label={`${b.title}, ${range(shownAt.start, shownAt.mins)}`}
                  onKeyDown={(e) => onBlockKey(e, b)}
                  onBlur={() => {
                    if (refocus.current === b.id) refocus.current = null;
                  }}
                  onClick={(e) => {
                    if (swallowClick.current) e.preventDefault();
                    swallowClick.current = false;
                  }}
                  {...pointer(b, "move")}
                >
                  {face}
                </button>
                <span className="plan-acts">
                  <label className="plan-tick">
                    <input type="checkbox" aria-label={`Done: ${b.title}`} checked={!!b.done} disabled={offline} onChange={() => actions!.tick(b.id, !b.done)} />
                    <DrawnCheck on={!!b.done} size={13} className="plan-tick-mark" />
                  </label>
                  <button type="button" className="plan-x" disabled={offline} aria-label={`Unplan ${b.title}`} onClick={() => actions!.unplace(b.id, date)}>
                    <span aria-hidden>×</span>
                  </button>
                </span>
                <span className="plan-resize" aria-hidden {...pointer(b, "resize")} />
              </m.li>
            );
          })}
        </ol>
        {ghost && (
          <m.p
            {...glide}
            className="plan-ghost"
            aria-hidden
            style={{
              top: blockTop(ghost.start, startM),
              height: blockHeight(ghost.mins),
            }}
          >
            <span className="plan-ghost-time">{range(ghost.start, ghost.mins)}</span>
          </m.p>
        )}
        {live && hint && (
          <m.p {...glide} className="plan-ghost plan-drop" aria-hidden style={{ top: slotTop(hint.start), height: blockHeight(hint.mins) }}>
            <span className="plan-ghost-time">{range(hint.start, hint.mins)}</span>
          </m.p>
        )}
        {nowM !== null && (
          <p className="nowline" style={{ top: minToPx(nowM, startM) - NOW_LEAD }} aria-label={`Now ${clock12(toHM(nowM))}`}>
            <NowMarker className="now-marker" />
            <span className="now-time">{clock12(toHM(nowM))}</span>
            <span className="now-rule" aria-hidden />
          </p>
        )}
        {live && !offline && picker !== null && (
          <SlotPicker
            key={picker}
            at={picker}
            board={board!}
            style={{ top: pickerTop(picker) }}
            onPick={(t, mins) => {
              const p = clampBlock(picker, mins);
              actions!.place(t.id, date, p.start, p.mins);
            }}
            onCreate={(t, mins) => {
              const p = clampBlock(picker, mins);
              void actions!.addAndPlace(t, date, p.start, p.mins);
            }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
      {board && <DoneThatDay board={board} />}
    </m.div>
  );
}

function DoneThatDay({ board }: { board: BoardData }) {
  const done = board.tasks.filter((t) => t.done && t.done_on === board.date);
  if (!done.length) return null;
  return (
    <section className="plan-done" aria-label="Done that day">
      <h3 className="plan-done-label">
        DONE <span className="count-chip">{done.length}</span>
      </h3>
      <ul className="plan-done-list">
        {done.map((t) => (
          <li key={t.id} className="plan-done-row">
            <CheckIcon size={14} className="plan-done-tick" />
            <span className="plan-done-title">{t.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
