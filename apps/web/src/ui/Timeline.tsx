import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { useDroppable } from "@dnd-kit/core";
import { AnimatePresence, animate, m } from "motion/react";
import { layoutLanes, SLOT, toHM, toMin } from "@shared/planning.ts";
import { TIMELINE } from "../lib/dnd";
import { isOptimistic, type Actions } from "../lib/useActions";
import { clampBlock, dragBlock, moveBlock, openHour, slotAt, widenRange, type Placed } from "../lib/timeline";
import { useIsOffline } from "../lib/offline";
import { buzz } from "../lib/swipe";
import { useDropHint } from "./DndProvider";
import { clock12, hourLabel } from "./format";
import { ChevronIcon, DrawnCheck, NowMarker } from "./icons";
import { reducedMotion, SNAPPY, useLayoutDependency } from "./motion";
import { prepLink, prepsOf, words } from "@shared/inbox.ts";
import { BLOCK_LEAD, blockHeight, blockTop, gridHeight, HOUR_PX, LINE_DROP, minToPx, NOW_LEAD } from "./plan";
import { SlotPicker } from "./SlotPicker";
import type { BoardData, PlanBlock, PlanData } from "./types";

const KEY_IDLE = 400;
const ROOM_FOR_META = 40; // minutes × zoom: a block this tall has room for a second line // arrow presses batch into one save after this pause
const DRAG_SLOP = 4;
// On touch a block moves only after a stationary long press, so a swipe over the line still scrolls it.
export const LONG_PRESS = 250;
const PRESS_SLOP = 5;
const DAY = 24 * 60;

type Draft = { id: string; start: number; mins: number; via: "key" | "pointer" };
type Drag = { id: string; x0: number; y0: number; start: number; mins: number; mode: "move" | "resize" | "top"; moved: boolean; armed: boolean; k: number };

// The grid's geometry is in comp px (plan.ts); on screen it is scaled by the frame's --u, like the rest of
// the print, and by the line's own --zoom. px() writes a comp length for CSS; scale() (in Timeline) measures
// screen px per comp px, so drags and drops follow the zoom without knowing about it.
const px = (n: number) => `calc(${n} * var(--u) * var(--zoom, 1))`;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

const clockOf = (m: number) => (m >= DAY ? "12:00" : clock12(toHM(m)));
const range = (s: number, mins: number) => `${clockOf(s)}–${clockOf(s + mins)}`;

type Props = {
  plan: PlanData; board?: BoardData; actions?: Actions; onOpen?: (id: string) => void; zoom?: number; onZoom?: (z: number) => void;
  preview?: { task_id: string; title: string; start: string; mins: number; why: string }[]; // an auto plan waiting to be accepted
};

// The line: hour grid, events and planned blocks. With actions, blocks drag (body moves, bottom edge
// resizes) and take arrow keys; an empty slot opens the SlotPicker (on touch, after a long press). Without
// (fixture), it only draws.
export function Timeline({ plan, board, actions, onOpen, zoom = 1, onZoom, preview }: Props) {
  const { nowM, anchorM } = plan;
  const date = board?.date ?? "";
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() => hiddenFor(date));
  useEffect(() => setHiddenKeys(hiddenFor(date)), [date]);
  const keyOf = (b: { startM: number; title: string }) => `${b.startM}|${b.title}`;
  const setHidden = (next: string[]) => {
    setHiddenKeys(next);
    try { localStorage.setItem(HIDDEN, JSON.stringify({ date, keys: next })); } catch { /* hidden for this visit */ }
  };
  const blocks = useMemo(() => plan.blocks.filter((b) => b.kind !== "event" || !hiddenKeys.includes(keyOf(b))), [plan.blocks, hiddenKeys]); // eslint-disable-line react-hooks/exhaustive-deps -- keyOf is pure
  // Hidden events as pins in the gutter: those starting within a pin's height of each other, at this zoom, share one.
  const pins = useMemo(() => {
    const reach = (16 * 60) / (HOUR_PX * zoom);
    const out: PlanBlock[][] = [];
    for (const b of plan.blocks.filter((x) => x.kind === "event" && hiddenKeys.includes(keyOf(x))).sort((x, y) => x.startM - y.startM)) {
      const g = out.at(-1);
      if (g && b.startM - g[0].startM <= reach) g.push(b); else out.push([b]);
    }
    return out;
  }, [plan.blocks, hiddenKeys, zoom]); // eslint-disable-line react-hooks/exhaustive-deps -- keyOf is pure
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
  const [eventMenu, setEventMenu] = useState<string | null>(null); // the event whose menu is open
  useEffect(() => setEventMenu(null), [date]);
  const keyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refocus = useRef<string | null>(null);
  const swallowClick = useRef(false);
  const hint = useDropHint();
  const [cursor, setCursor] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  // Touch has no hover: a tap on a block shows its tick and unplan; a long press lifts it.
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastPointer = useRef("mouse");
  // A finger on empty time: the picker opens on a long press, so a tap or a swipe over the line never opens it.
  const slotPress = useRef<{ x: number; y: number } | null>(null);
  // Blocks, the drag ghost and the drop hint spring between 15-minute slots instead of jumping.
  const layoutDependency = useLayoutDependency();
  const glide = { layout: "position" as const, transition: SNAPPY };
  const snap = { ...glide, layoutDependency }; // blocks hold still while the divider is dragged

  // Keyboard drafts may run past the drawn hours, so widen to fit; a pointer drag keeps the grid still under the hand.
  const { startM, endM } = useMemo(
    () => (draft?.via === "key" ? widenRange(plan.startM, plan.endM, [{ s: draft.start, e: draft.start + draft.mins }]) : plan),
    [plan, draft],
  );

  // Screen px per comp px, from the grid as drawn: its height over the height it was given in comp px.
  const scale = () => {
    const h = grid.current?.getBoundingClientRect().height ?? 0;
    const c = gridHeight(startM, endM);
    return h > 0 && c > 0 ? h / c : 1;
  };

  // The visible line is the drop target; the grid inside it says where minutes are.
  const drop = useDroppable({
    id: TIMELINE,
    disabled: !live || offline,
    data: { gridTop: () => grid.current?.getBoundingClientRect().top ?? 0, startM, endM, scale },
  });

  useEffect(() => {
    // Open on the day's shape (lib/timeline.ts openHour), then leave the scroll alone.
    const sc = scroller.current;
    if (!sc) return;
    const top = openHour({
      startM, endM, nowM, viewMins: (sc.clientHeight / scale() * 60) / HOUR_PX,
      spans: (blocks.length ? blocks : [{ startM: anchorM, mins: 0 }]).map((b) => ({ s: b.startM, e: b.startM + b.mins })),
    });
    sc.scrollTop = (((top - startM) * HOUR_PX) / 60) * scale();
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps -- once per day shown

  // A keyboard batch waiting on its idle timer. It is saved early rather than dropped: before a batch starts on
  // another block, when the line unmounts, and when the page is hidden.
  // It remembers the day and block it started on: navigating away within the pause must not move the write.
  type Pending = { id: string; taskId: string; date: string; was: { start: number; mins: number }; start: number; mins: number };
  const pending = useRef<Pending | null>(null);
  const commitRef = useRef<(id: string, next: { start: number; mins: number }, at?: { date: string; was: Placed; taskId: string }) => void>(() => {});
  const flush = () => {
    clearTimeout(keyTimer.current);
    const p = pending.current;
    pending.current = null;
    if (p) commitRef.current(p.id, p, { date: p.date, was: p.was, taskId: p.taskId });
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

  // Once a long press has lifted a block, the finger moves it rather than scrolling the line.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const hold = (e: TouchEvent) => {
      if (drag.current?.armed && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", hold, { passive: false });
    return () => {
      el.removeEventListener("touchmove", hold);
      clearTimeout(pressTimer.current);
    };
  }, []);

  // Zoom glides: --zoom is tweened on the line's element, outside React, so the hours, the blocks and the scroll
  // move as one (a render per frame would set the blocks' layout springs off on their own). Each frame keeps the
  // minute under the hand (or the middle of what's in view) where it was. A pinch follows the fingers directly.
  const zoomRef = useRef(zoom); // the zoom asked for
  const shown = useRef(zoom); // the zoom on screen, mid-glide
  const zoomGlide = useRef<{ stop: () => void } | null>(null);
  const focal = useRef<number | null>(null);
  const direct = useRef(false);
  const zoomTo = (z: number, y?: number, now = false) => {
    focal.current = y ?? null;
    direct.current = now;
    onZoom?.(clampZoom(z));
  };
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const sc = scroller.current, g = grid.current;
    if (!sc || !g) return;
    if (shown.current === zoom && !zoomGlide.current) return void sc.style.setProperty("--zoom", String(zoom));
    const view = sc.getBoundingClientRect();
    const y = focal.current ?? (Math.max(view.top, 0) + Math.min(view.bottom, window.innerHeight)) / 2;
    const per = (y - g.getBoundingClientRect().top) / shown.current; // that minute's offset into the grid, per unit of zoom
    const apply = (v: number) => {
      shown.current = v;
      sc.style.setProperty("--zoom", String(v));
      const delta = g.getBoundingClientRect().top + per * v - y;
      if (sc.scrollHeight > sc.clientHeight + 1) sc.scrollTop += delta; // the line scrolls itself (desktop)
      else window.scrollBy(0, delta); // the page does (phone)
    };
    zoomGlide.current?.stop();
    zoomGlide.current = null;
    if (direct.current || reducedMotion()) return apply(zoom);
    zoomGlide.current = animate(shown.current, zoom, {
      duration: 0.26, ease: [0.22, 1, 0.36, 1], onUpdate: apply, onComplete: () => { zoomGlide.current = null; },
    });
  }, [zoom]);
  useEffect(() => () => zoomGlide.current?.stop(), []);
  // Ctrl + wheel (and a trackpad pinch, which arrives as one) and a two-finger pinch zoom the line.
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !onZoom) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomToRef.current(zoomRef.current * Math.exp(-e.deltaY * 0.002), e.clientY);
    };
    let pinch: { d: number; z: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = { d: dist(e.touches), z: zoomRef.current };
      clearTimeout(pressTimer.current); // two fingers are a pinch, never a long press
      drag.current = null;
    };
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      zoomToRef.current(pinch.z * (dist(e.touches) / pinch.d), (e.touches[0].clientY + e.touches[1].clientY) / 2, true);
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [!!onZoom]); // eslint-disable-line react-hooks/exhaustive-deps -- refs only

  // Blocks wholly out of sight, above and below what shows of the line (its own scroll on a desktop, the page's on
  // a phone): counted for the pills at either end. Measured from the drawn blocks, so zoom and drags just work.
  const [out, setOut] = useState({ above: 0, below: 0 });
  const measure = useRef(() => {});
  measure.current = () => {
    const sc = scroller.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
    let above = 0, below = 0;
    sc.querySelectorAll(".plan-block").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.bottom <= top + 1) above++;
      else if (b.top >= bottom - 1) below++;
    });
    setOut((o) => (o.above === above && o.below === below ? o : { above, below }));
  };
  useLayoutEffect(() => measure.current());
  useEffect(() => {
    const sc = scroller.current;
    const on = () => measure.current();
    sc?.addEventListener("scroll", on, { passive: true });
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      sc?.removeEventListener("scroll", on);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  // A pill takes you to the nearest block out of sight that way.
  const reveal = (dir: "above" | "below") => {
    const sc = scroller.current;
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
    const hidden = [...sc.querySelectorAll<HTMLElement>(".plan-block")]
      .filter((el) => (dir === "above" ? el.getBoundingClientRect().bottom <= top + 1 : el.getBoundingClientRect().top >= bottom - 1))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    (dir === "above" ? hidden.at(-1) : hidden[0])?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  };

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
  // The half and quarter hours: drawn always, faded in by the zoom (CSS reads --zoom), so they come as you zoom in.
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let m = startM + 15; m < endM; m += 15) if (m % 60) out.push(m);
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

  // A block moved or resized (by its own id): the write goes to that block, for its task.
  const commit = (id: string, next: { start: number; mins: number }, at?: { date: string; was: Placed; taskId: string }) => {
    setDraft(null);
    const b = blocks.find((x) => x.id === id);
    const was = at?.was ?? (b && { start: b.startM, mins: b.mins });
    const taskId = at?.taskId ?? b?.taskId;
    if (!was || !taskId || !actions || (was.start === next.start && was.mins === next.mins)) return;
    refocus.current = document.activeElement?.closest(`[data-block]`)?.getAttribute("data-block") === id ? id : null;
    actions.place(taskId, at?.date ?? date, next.start, next.mins, id);
  };
  commitRef.current = commit;

  const onBlockKey = (e: KeyboardEvent, b: PlanBlock) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (offline) return;
    if (pending.current && (pending.current.id !== b.id || pending.current.date !== date)) flush();
    const step = e.key === "ArrowUp" ? -SLOT : SLOT; // a slot a press; the pointer gets the 5m grid
    const cur = draftRef.current?.id === b.id ? draftRef.current : { start: b.startM, mins: b.mins };
    const next = e.shiftKey ? clampBlock(cur.start, cur.mins + step) : moveBlock(cur.start + step, cur.mins);
    setDraft({ id: b.id, ...next, via: "key" });
    clearTimeout(keyTimer.current);
    pending.current = { id: b.id, taskId: b.taskId ?? b.id, date, was: pending.current?.was ?? { start: b.startM, mins: b.mins }, ...next };
    keyTimer.current = setTimeout(flush, KEY_IDLE);
  };

  const dragTo = (y: number) => {
    const d = drag.current!;
    return dragBlock(d, y - d.y0, d.k);
  };
  const pointer = (b: PlanBlock, mode: Drag["mode"]) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      lastPointer.current = e.pointerType;
      swallowClick.current = false; // whatever the last gesture left unconsumed
      if (offline || e.button !== 0 || draftRef.current?.via === "key") return;
      // The resize grips are handles (touch-action: none) and takes the finger at once; the body waits for a long press.
      const wait = e.pointerType === "touch" && mode === "move";
      if (!wait) e.currentTarget.setPointerCapture?.(e.pointerId);
      const d: Drag = { id: b.id, x0: e.clientX, y0: e.clientY, start: b.startM, mins: b.mins, mode, moved: false, armed: !wait, k: scale() };
      drag.current = d;
      clearTimeout(pressTimer.current);
      if (!wait) return;
      const el = e.currentTarget;
      const pid = e.pointerId;
      pressTimer.current = setTimeout(() => {
        if (drag.current !== d) return;
        d.armed = true;
        try {
          el.setPointerCapture?.(pid);
        } catch {
          /* the pointer is already gone */
        }
        buzz(8);
        setPressed(b.id);
      }, LONG_PRESS);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== b.id) return;
      if (!d.armed) {
        // Moved before the long press landed: it is a scroll, not a lift.
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > PRESS_SLOP) {
          clearTimeout(pressTimer.current);
          drag.current = null;
        }
        return;
      }
      if (!d.moved && Math.abs(e.clientY - d.y0) < DRAG_SLOP) return;
      d.moved = true;
      const next = dragTo(e.clientY);
      const cur = draftRef.current;
      if (!cur || cur.start !== next.start || cur.mins !== next.mins) setDraft({ id: b.id, ...next, via: "pointer" });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      clearTimeout(pressTimer.current);
      setPressed(null);
      const d = drag.current;
      if (!d || d.id !== b.id) return;
      const next = d.moved ? dragTo(e.clientY) : null;
      drag.current = null;
      if (d.armed && e.pointerType === "touch" && d.mode === "move") swallowClick.current = true; // a long press is not a tap
      if (!next) return;
      swallowClick.current = true;
      commit(b.id, next);
    },
    onPointerCancel: () => {
      clearTimeout(pressTimer.current);
      setPressed(null);
      drag.current = null;
      setDraft(null);
    },
    onLostPointerCapture: () => {
      if (drag.current?.id === b.id && drag.current.armed) {
        setPressed(null);
        drag.current = null;
        setDraft(null);
      }
    },
  });

  // The free-time surface: one tab stop; arrows move a slot cursor, Enter opens the picker there.
  const defaultSlot = () => Math.min(DAY - SLOT, nowM !== null ? Math.ceil(nowM / SLOT) * SLOT : Math.max(startM, 9 * 60));
  const moveCursor = (m: number) => {
    const c = Math.max(0, Math.min(DAY - SLOT, m));
    setCursor(c);
    const sc = scroller.current;
    if (sc) {
      const k = scale();
      const top = blockTop(c, startM) * k;
      if (top < sc.scrollTop) sc.scrollTop = top - 8;
      else if (top + 40 * k > sc.scrollTop + sc.clientHeight) sc.scrollTop = top + 48 * k - sc.clientHeight;
    }
  };
  const onSlotsKey = (e: KeyboardEvent) => {
    const c = cursor ?? defaultSlot();
    const steps: Record<string, number> = { ArrowUp: -SLOT, ArrowDown: SLOT, PageUp: -60, PageDown: 60 };
    if (e.key in steps) moveCursor(c + steps[e.key]);
    else if (e.key === "Home") moveCursor(startM);
    else if (e.key === "End") moveCursor(endM - SLOT);
    else if (e.key === "Enter" || e.key === " ") offline || setPicker(c);
    else return;
    e.preventDefault();
  };

  // A long press that opened the picker lifts after it's open: that lift's click must not land on the sheet's
  // backdrop and close it again.
  const eatNextClick = () => {
    const eat = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const done = () => setTimeout(() => document.removeEventListener("click", eat, true), 100);
    document.addEventListener("click", eat, { capture: true, once: true });
    window.addEventListener("pointerup", done, { once: true });
    window.addEventListener("pointercancel", done, { once: true });
  };
  const endSlotPress = () => {
    if (!slotPress.current) return;
    slotPress.current = null;
    clearTimeout(pressTimer.current);
  };
  const slotPointer = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      lastPointer.current = e.pointerType;
      if (e.pointerType !== "touch" || offline || e.target !== e.currentTarget) return;
      const el = e.currentTarget, y = e.clientY;
      slotPress.current = { x: e.clientX, y };
      clearTimeout(pressTimer.current);
      pressTimer.current = setTimeout(() => {
        slotPress.current = null;
        const m = slotAt(y - el.getBoundingClientRect().top, scale(), startM);
        buzz(8);
        eatNextClick();
        setRevealed(null);
        setCursor(m);
        setPicker(m);
      }, LONG_PRESS);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const p = slotPress.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP) endSlotPress(); // a scroll
    },
    onPointerUp: endSlotPress,
    onPointerCancel: endSlotPress,
  };

  const ghost = draft?.via === "pointer" ? draft : null;
  const menuBlock = eventMenu ? lanes.find((b) => b.id === eventMenu) : undefined;
  const slotTop = (m: number) => blockTop(m, startM);
  const pickerTop = (m: number) => {
    const below = slotTop(m) + 44;
    return below + 330 > gridHeight(startM, endM) ? Math.max(0, slotTop(m) - 336) : below;
  };

  return (
    <m.div className="plan-scroll" layoutScroll ref={(n: HTMLDivElement | null) => { scroller.current = n; drop.setNodeRef(n); }}>
      <OutOfSight dir="above" n={out.above} onClick={() => reveal("above")} />
      <div className="plan-grid" ref={grid} style={{ height: px(gridHeight(startM, endM)) }}>
        {live && (
          <div
            className="plan-slots"
            role="group"
            aria-label="Free time"
            tabIndex={0}
            onFocus={() => cursor === null && setCursor(defaultSlot())}
            onBlur={() => picker === null && setCursor(null)}
            onKeyDown={onSlotsKey}
            {...slotPointer}
            onContextMenu={(e) => lastPointer.current === "touch" && e.preventDefault()}
            onClick={(e) => {
              setRevealed(null);
              // A mouse clicks; a finger long-presses (slotPointer), and its tap only puts away a tapped block's tools.
              if (offline || e.target !== e.currentTarget || lastPointer.current === "touch") return;
              const m = slotAt(e.clientY - e.currentTarget.getBoundingClientRect().top, scale(), startM);
              setCursor(m);
              setPicker(m);
            }}
          />
        )}
        {live && cursor !== null && (
          <span className="plan-cursor" aria-hidden style={{ top: px(slotTop(cursor)), height: px((SLOT * HOUR_PX) / 60 + BLOCK_LEAD / 2) }}>
            <span className="plan-cursor-time">{clockOf(cursor)}</span>
          </span>
        )}
        <p className="sr-only" aria-live="polite">{cursor !== null && picker === null ? clockOf(cursor) : ""}</p>
        <div className="hour-lines" aria-hidden>
          {hours.map((m) => (
            <span key={m} className="hour-line" style={{ top: px(minToPx(m, startM) + LINE_DROP) }} />
          ))}
          {ticks.map((m) => (
            <span key={m} className={`hour-line ${m % 30 ? "is-quarter" : "is-half"}`} style={{ top: px(minToPx(m, startM) + LINE_DROP) }} />
          ))}
        </div>
        <ol className="hour-labels" aria-label="Hours">
          {hours.map((m) => (
            <li key={m} className="hour-label" style={{ top: px(minToPx(m, startM)) }}>
              {hourLabel(m / 60)}
            </li>
          ))}
          {ticks.map((m) => (
            <li key={m} className={`hour-label is-sub ${m % 30 ? "is-quarter" : "is-half"}`} style={{ top: px(minToPx(m, startM)) }} aria-hidden>
              {clock12(toHM(m))}
            </li>
          ))}
        </ol>
        {pins.map((g) => (
          <button key={g.map(keyOf).join()} type="button" className="plan-pin" aria-label={`Show ${g.map((b) => `${b.title} ${b.time}`).join(", ")}`}
            title={g.map((b) => `${b.time} ${b.title}`).join(", ")} style={{ top: px(minToPx(g[0].startM, startM)) }}
            onClick={() => setHidden(hiddenKeys.filter((k) => !g.some((b) => keyOf(b) === k)))}>
            <svg viewBox="0 0 32 24" aria-hidden>
              <path className="pin-body" d="M30.5 12 19.2 4.6a10.6 10.6 0 1 0 0 14.8z" />
              <circle className="pin-eye" cx="11.4" cy="12" r="6.6" />
              <text x="11.4" y="12.2" textAnchor="middle" dominantBaseline="central">{g.length}</text>
            </svg>
          </button>
        ))}
        <ol className="plan-blocks" aria-label="Plan">
          {lanes.map((b) => {
            const editable = live && b.kind === "task" && !isOptimistic(b.id) && !isOptimistic(b.taskId ?? "");
            const dragging = ghost?.id === b.id;
            const shownAt = at(b);
            const time = shownAt.start === b.startM ? b.time : clockOf(shownAt.start);
            const cls = `plan-block plan-${b.kind}${b.current ? " is-current" : ""}${b.done ? " is-done" : ""}${editable ? " is-live" : ""}${offline ? " is-offline" : ""}${dragging ? " is-lifted" : ""}${draft?.id === b.id && draft.via === "key" ? " is-keyed" : ""}${revealed === b.id ? " is-revealed" : ""}${pressed === b.id ? " is-pressed" : ""}${b.colour ? " has-epic" : ""}`;
            const style = {
              ...(b.colour ? { ["--epic" as string]: `var(--epic-${b.colour})` } : null),
              top: px(blockTop(b.startM, startM)),
              height: px(blockHeight(b.mins)),
              left: `calc(var(--lane-left) + ${b.col} * var(--lane-w) / ${b.cols})`,
              width: `calc(var(--lane-w) * ${b.span} / ${b.cols}${b.cols > 1 ? " - 0.3cqw" : ""})`,
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
                  {b.meta && shownAt.mins * zoom >= ROOM_FOR_META && <span className="plan-meta">{b.meta}</span>}
                </span>
              </>
            );
            if (b.kind === "event" && live && b.event) {
              return (
                <m.li key={b.id} className={`${cls} is-live`} style={style} {...snap}>
                  <button type="button" className="plan-body" aria-haspopup="menu" aria-expanded={eventMenu === b.id}
                    aria-label={`${b.title}, ${range(b.startM, b.mins)}`}
                    onClick={(e) => { e.stopPropagation(); setEventMenu((x) => (x === b.id ? null : b.id)); }}>
                    {face}
                  </button>
                </m.li>
              );
            }
            if (!editable) return <m.li key={b.id} className={cls} style={style} {...snap}>{face}</m.li>;
            return (
              <m.li key={b.id} data-block={b.id} data-task={b.taskId} className={cls} style={style} {...snap}>
                <button
                  type="button"
                  className="plan-body"
                  aria-label={`${b.title}, ${range(shownAt.start, shownAt.mins)}`}
                  onKeyDown={(e) => onBlockKey(e, b)}
                  onBlur={() => {
                    if (refocus.current === b.id) refocus.current = null;
                  }}
                  onClick={(e) => {
                    // A click opens the ticket; on touch the first tap shows the tick and unplan, the next opens it.
                    if (swallowClick.current) e.preventDefault();
                    else if (lastPointer.current === "touch" && revealed !== b.id) setRevealed(b.id);
                    else onOpen?.(b.taskId!);
                    swallowClick.current = false;
                  }}
                  onContextMenu={(e) => lastPointer.current === "touch" && e.preventDefault()}
                  {...pointer(b, "move")}
                >
                  {face}
                </button>
                <span className="plan-acts">
                  <label className="plan-tick">
                    <input type="checkbox" aria-label={`Done: ${b.title}`} checked={!!b.done} disabled={offline} onChange={() => actions!.tick(b.taskId!, !b.done)} />
                    <DrawnCheck on={!!b.done} size={13} className="plan-tick-mark" />
                  </label>
                  <button type="button" className="plan-x" disabled={offline} aria-label={`Unplan ${b.title}`} onClick={() => actions!.unplace(b.taskId!, date, b.id)}>
                    <span aria-hidden>×</span>
                  </button>
                </span>
                <span className="plan-resize plan-resize-top" aria-hidden {...pointer(b, "top")} />
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
              top: px(blockTop(ghost.start, startM)),
              height: px(blockHeight(ghost.mins)),
            }}
          >
            <span className="plan-ghost-time">{range(ghost.start, ghost.mins)}</span>
          </m.p>
        )}
        {preview?.map((p) => {
          const s = toMin(p.start) ?? 0;
          return (
            <p key={`${p.task_id}@${p.start}`} className="plan-ghost plan-preview" style={{ top: px(blockTop(s, startM)), height: px(blockHeight(p.mins)) }}>
              <span className="plan-ghost-time">{clockOf(s)}</span>
              <span className="plan-preview-title">{p.title}</span>
              {p.mins * zoom >= ROOM_FOR_META && <span className="plan-preview-why">{p.why}</span>}
            </p>
          );
        })}
        {live && hint && (
          <m.p {...glide} className="plan-ghost plan-drop" aria-hidden style={{ top: px(slotTop(hint.start)), height: px(blockHeight(hint.mins)) }}>
            <span className="plan-ghost-time">{range(hint.start, hint.mins)}</span>
          </m.p>
        )}
        {nowM !== null && (
          <p className="nowline" style={{ top: `calc(${px(minToPx(nowM, startM))} - ${NOW_LEAD} * var(--u))` }} aria-label={`Now ${clock12(toHM(nowM))}`}>
            <NowMarker className="now-marker" />
            <span className="now-time">{clock12(toHM(nowM))}</span>
            <span className="now-rule" aria-hidden />
          </p>
        )}
        {live && menuBlock?.event && (
          <EventMenu
            key={menuBlock.id}
            style={{ top: px(blockTop(menuBlock.startM, startM) + blockHeight(menuBlock.mins) + 6) }}
            title={menuBlock.title}
            where={menuBlock.event.where}
            offline={offline}
            preps={prepsOf(board!.tasks, date, menuBlock.event, board!.day?.events ?? [])}
            tasks={board!.tasks.filter((t) => !t.done)}
            onOpenTask={(id) => { setEventMenu(null); onOpen?.(id); }}
            onLink={(id) => { setEventMenu(null); void actions!.save(id, { prep_for: prepLink(date, menuBlock.event!) }); }}
            onPrep={() => { setEventMenu(null); void actions!.prep({ date, ...menuBlock.event! }); }}
            onHide={() => { setEventMenu(null); setHidden([...hiddenKeys, keyOf(menuBlock)]); }}
            onClose={() => setEventMenu(null)}
          />
        )}
        {live && !offline && picker !== null && (
          <SlotPicker
            key={picker}
            at={picker}
            board={board!}
            style={{ top: px(pickerTop(picker)) }}
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
      <OutOfSight dir="below" n={out.below} onClick={() => reveal("below")} />
    </m.div>
  );
}

// "^ 3 above" / "v 2 below": floats at that end of the line (sticky, no height, so nothing moves for it).
function OutOfSight({ dir, n, onClick }: { dir: "above" | "below"; n: number; onClick: () => void }) {
  return (
    <div className={`plan-out is-${dir}`}>
      <AnimatePresence>
        {n > 0 && (
          <m.button key="pill" type="button" className="plan-out-pill" onClick={onClick}
            initial={{ opacity: 0, y: dir === "above" ? -6 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: dir === "above" ? -6 : 6 }}
            transition={{ duration: 0.16 }}>
            <ChevronIcon size={14} className="plan-out-chevron" />
            {n} {dir}
          </m.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// Events hidden from the line on this device, for the one day shown: "start|title" keys.
const HIDDEN = "toodoo.hiddenEvents";
function hiddenFor(date: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HIDDEN) ?? "null") as { date?: string; keys?: string[] } | null;
    return raw?.date === date && Array.isArray(raw.keys) ? raw.keys : [];
  } catch {
    return [];
  }
}

// An event's menu, under it on the line: its prep tasks (each opens its ticket), Create prep task, and Use a task as
// prep (an open task, a Jira card say, found by its title). Escape or a click away closes it.
type MenuTask = { id: string; title: string; done: boolean };
function EventMenu({ style, title, where, offline, preps, tasks, onOpenTask, onLink, onPrep, onHide, onClose }: {
  style: CSSProperties; title: string; where?: string; offline: boolean; preps: MenuTask[]; tasks: MenuTask[];
  onOpenTask: (id: string) => void; onLink: (id: string) => void; onPrep: () => void; onHide: () => void; onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [finding, setFinding] = useState(false);
  const [q, setQ] = useState("");
  const found = useMemo(() => {
    const want = words(q);
    const linked = new Set(preps.map((p) => p.id));
    return tasks.filter((t) => !linked.has(t.id) && (!want.size || [...want].every((w) => [...words(t.title)].some((x) => x.startsWith(w))))).slice(0, 6);
  }, [q, tasks, preps]);
  useEffect(() => {
    root.current?.querySelector("button")?.focus();
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <m.div ref={root} className="event-menu" role="menu" aria-label={title} style={style}
      initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.14 }}>
      <p className="event-menu-head">{title}{where ? ` · ${where}` : ""}</p>
      {preps.map((p) => (
        <button key={p.id} type="button" role="menuitem" className={`event-menu-prep${p.done ? " is-done" : ""}`} onClick={() => onOpenTask(p.id)}>
          <span className="event-menu-tag">PREP</span>{p.title}
        </button>
      ))}
      {finding ? (
        <div className="event-menu-find">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a task" aria-label="Find a task to use as prep"
            autoComplete="off" spellCheck={false} />
          {found.map((t) => (
            <button key={t.id} type="button" role="menuitem" disabled={offline} onClick={() => onLink(t.id)}>{t.title}</button>
          ))}
          {!found.length && <p className="event-menu-none">No open task matches</p>}
        </div>
      ) : (
        <>
          <button type="button" role="menuitem" disabled={offline} onClick={onPrep}>Create prep task</button>
          <button type="button" role="menuitem" disabled={offline || !tasks.length} onClick={() => setFinding(true)}>Use a task as prep…</button>
          <button type="button" role="menuitem" onClick={onHide}>Hide</button>
        </>
      )}
    </m.div>
  );
}
