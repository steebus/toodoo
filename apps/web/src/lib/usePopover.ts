import { useEffect, useId, useRef, useState, type ToggleEvent } from "react";

// A button and the small panel it opens. Where the browser has the Popover API the panel is a popover="auto": it
// sits in the top layer (no overflow or stacking context clips it), and the browser closes it on Escape or a click
// away and hands focus back to the button. Where it has anchor positioning too, CSS ties the panel to its button
// and flips it off the window's edges; without, it is placed under the button as it opens. Browsers without
// popovers (and jsdom) get the panel rendered while open, closed by a click away or Escape, as before.
export const hasPopover = () => typeof HTMLElement !== "undefined" && Object.hasOwn(HTMLElement.prototype, "popover");
const hasAnchors = () => typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("position-area: block-end");

export function usePopover() {
  const native = hasPopover();
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (native || !open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [native, open]);

  // Under the button, right edges in line, where CSS can't anchor it.
  const place = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== "open" || hasAnchors() || !button.current) return;
    const b = button.current.getBoundingClientRect();
    Object.assign(e.currentTarget.style, { top: `${b.bottom + 6}px`, right: `${window.innerWidth - b.right}px` });
  };

  const close = () => (native ? panel.current?.hidePopover() : setOpen(false));
  return {
    open,
    close,
    rootRef: root,
    // The panel is in the DOM only while open, unless it is a popover (then the browser shows and hides it).
    shown: native || open,
    buttonProps: native
      ? { ref: button, popoverTarget: id, "aria-expanded": open }
      : { ref: button, "aria-expanded": open, onClick: () => setOpen((o) => !o) },
    panelProps: native
      ? { ref: panel, id, popover: "auto" as const, onBeforeToggle: place, onToggle: (e: ToggleEvent<HTMLDivElement>) => setOpen(e.newState === "open") }
      : { ref: panel },
  };
}
