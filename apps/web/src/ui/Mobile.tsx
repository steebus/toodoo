import { m } from "motion/react";
import { useEffect, useRef } from "react";
import type { Epic } from "@shared/epics.ts";
import type { NewTask } from "../lib/useActions";
import { QuickAdd } from "./QuickAdd";

export type Tab = "today" | "plan";
// A sideways swipe across the page goes between Plan and Today, as if they sat side by side. Not one that starts on
// a card (its own swipe ticks it), a plan block, something to type in, or a strip that scrolls sideways.
const NOT_A_PAGE_SWIPE = "[data-docket], .plan-block, input, textarea, select, .nextup, .chips, .qa-tools, dialog";
export function useSwipeTabs(on: boolean, tab: Tab, onTab: (t: Tab) => void) {
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const onTabRef = useRef(onTab);
  onTabRef.current = onTab;
  useEffect(() => {
    if (!on) return;
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: TouchEvent) => {
      const el = e.target as Element | null;
      start = e.touches.length === 1 && !el?.closest(NOT_A_PAGE_SWIPE) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
    };
    const end = (e: TouchEvent) => {
      const s = start;
      start = null;
      if (!s) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - s.x, dy = p.clientY - s.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - s.t > 600) return;
      const next: Tab = dx < 0 ? "today" : "plan"; // swipe left to the right-hand tab
      if (next !== tabRef.current) onTabRef.current(next);
    };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchend", end);
    };
  }, [on]);
}

// Thumb-reach add: a blank ticket over the bottom-right corner, a pen cross on it, torn along its foot.
export function AddButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <m.button type="button" className="fab" aria-label="Add a to do" disabled={disabled} whileTap={{ scale: 0.9, rotate: 0 }} onClick={onClick}>
      <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
        <path d="M12.3 4.2c-.3 4.9-.2 10.3.1 15.6M4.6 12.1c4.9.4 10 .2 14.9-.3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      </svg>
      <span className="fab-print" aria-hidden>ADD</span>
    </m.button>
  );
}

type SheetProps = {
  today: string; nowM: number; initial: string;
  onAdd: (t: NewTask) => Promise<boolean>;
  onPlace?: (t: NewTask, date: string, start: number, mins: number) => Promise<boolean>;
  onClose: () => void;
  onFailed: (line: string) => void; // the add did not take: open again with what was typed
  onExpand: (line: string) => void; // swiped up: the full ticket, blank but for what was typed
  epics?: Epic[];
  tags?: string[];
};

// The quick add in a bottom sheet. Enter files the line and the sheet drops away, so the new docket can fly
// from where the input was to its rail.
export function AddSheet({ today, nowM, initial, onAdd, onPlace, onClose, onFailed, onExpand, epics, tags }: SheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    d.querySelector<HTMLInputElement>(".quickadd-input")?.focus();
    return () => {
      if (d.open && typeof d.close === "function") d.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="sheet addsheet quickadd-roomy"
      aria-label="Add a to do"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <QuickAdd today={today} nowM={nowM} initial={initial} epics={epics} tags={tags} tools
        onPlace={onPlace && ((t, date, start, mins) => { onClose(); return onPlace(t, date, start, mins); })}
        onExpand={(line) => { onClose(); onExpand(line); }}
        onAdd={(t, line) => {
          onClose();
          return onAdd(t).then((ok) => {
            if (!ok) onFailed(line);
            return ok;
          });
        }} />
    </dialog>
  );
}
