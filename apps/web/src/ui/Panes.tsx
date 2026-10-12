import { createContext, useCallback, useContext, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GripIcon } from "./icons";
import { FreezeLayout } from "./motion";

const KEY = "toodoo.split";
export const PLAN_SPLIT = 33.85; // the comp's own split
export const PRESET_SPLIT: Record<string, number> = { Capture: 30, Plan: PLAN_SPLIT, Focus: 70 };
export const COMPACT_AT = 55; // past this split the To do side is a narrow column (Focus)
export const clampSplit = (v: number) => (Number.isFinite(v) ? Math.min(75, Math.max(25, v)) : PLAN_SPLIT);

// Per device, in localStorage; blocked or junk storage means the comp's split.
export function loadSplit(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? PLAN_SPLIT : clampSplit(Number(raw));
  } catch {
    return PLAN_SPLIT;
  }
}
export function saveSplit(v: number) {
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* storage unavailable: the split still applies for this session */
  }
}

export function useSplit() {
  const [split, set] = useState(loadSplit);
  const apply = useCallback((v: number, persist = true) => {
    const c = clampSplit(v);
    set(c);
    if (persist) saveSplit(c);
    return c;
  }, []);
  return [split, apply] as const;
}

type Split = ReturnType<typeof useSplit>;
const Ctx = createContext<{ split: Split; drag: (on: boolean) => void } | null>(null);

// The two panels share one custom property, --split (the divider's % of the width); pass.css lays out from it.
export function Panes({ split, children }: { split: Split; children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  const frozen = useContext(FreezeLayout);
  return (
    <Ctx.Provider value={{ split, drag: setDragging }}>
      <FreezeLayout.Provider value={frozen || dragging}>
        <main className={`pass-main${dragging ? " is-dragging" : ""}`} style={{ "--split": split[0] } as CSSProperties}>
          {children}
        </main>
      </FreezeLayout.Provider>
    </Ctx.Provider>
  );
}

export function Divider({ controls }: { controls?: string }) {
  const c = useContext(Ctx);
  const last = useRef(0);
  if (!c) return null;
  const [split, setSplit] = c.split;
  const move = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.closest(".pass")!.getBoundingClientRect();
    last.current = setSplit(((e.clientX - r.left) / r.width) * 100, false);
  };
  const key = (e: KeyboardEvent) => {
    const to = e.key === "ArrowRight" ? split + 2 : e.key === "ArrowLeft" ? split - 2 : e.key === "Home" ? 25 : e.key === "End" ? 75 : null;
    if (to === null) return;
    e.preventDefault();
    setSplit(to);
  };
  return (
    <div
      role="separator" tabIndex={0} className="r-divider-grip divider-grip" aria-label="Resize panels"
      aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(split)} aria-controls={controls}
      onKeyDown={key}
      onDoubleClick={() => setSplit(PLAN_SPLIT)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        last.current = split;
        c.drag(true);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture?.(e.pointerId) && move(e)}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture?.(e.pointerId)}
      onLostPointerCapture={() => {
        c.drag(false);
        saveSplit(last.current);
      }}
    >
      <GripIcon />
    </div>
  );
}
