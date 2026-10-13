import { m } from "motion/react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { Epic } from "@shared/epics.ts";
import type { NewTask } from "../lib/useActions";
import { QuickAdd } from "./QuickAdd";

export type Tab = "today" | "plan";
const TABS: { tab: Tab; label: string; panel: string }[] = [
  { tab: "today", label: "Today", panel: "todo" },
  { tab: "plan", label: "Plan", panel: "dayplan" },
];

// The phone's two rooms: the list and the line. The ink bar under the active tab slides between them.
// A tablist: arrows (and Home / End) move between the tabs and select as they go.
export function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.tab === tab);
    const to = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length
      : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    onTab(TABS[to].tab);
    e.currentTarget.querySelectorAll<HTMLElement>("[role=tab]")[to]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="View" onKeyDown={key}>
      {TABS.map((t) => (
        <button key={t.tab} id={`tab-${t.tab}`} type="button" role="tab" className="tab" aria-selected={tab === t.tab}
          tabIndex={tab === t.tab ? 0 : -1} aria-controls={t.panel} onClick={() => onTab(t.tab)}>
          {t.label}
          {tab === t.tab && <m.span className="tab-ink" layoutId="tab-ink" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

// Thumb-reach add: a round button over the bottom-right corner.
export function AddButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <m.button type="button" className="fab" aria-label="Add a to do" disabled={disabled} whileTap={{ scale: 0.88 }} onClick={onClick}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </m.button>
  );
}

type SheetProps = {
  today: string; nowM: number; initial: string;
  onAdd: (t: NewTask) => Promise<boolean>;
  onClose: () => void;
  onFailed: (line: string) => void; // the add did not take: open again with what was typed
  epics?: Epic[];
};

// The quick add in a bottom sheet. Enter files the line and the sheet drops away, so the new docket can fly
// from where the input was to its rail.
export function AddSheet({ today, nowM, initial, onAdd, onClose, onFailed, epics }: SheetProps) {
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
      className="sheet addsheet"
      aria-label="Add a to do"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <QuickAdd today={today} nowM={nowM} initial={initial} epics={epics}
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
