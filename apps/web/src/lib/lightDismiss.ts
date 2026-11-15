import type { MouseEvent, PointerEvent } from "react";

// A modal that closes on a tap on its backdrop. closedby="any" has the browser do it: only a press and release
// both outside the dialog's box count, and it runs the dialog's cancel (the same path as Escape). Browsers without
// closedby get the same rule here; a click on the dialog's own empty area (a tall sheet under short content) is
// inside its box, so it never closes it, as the old target-is-the-dialog test did.
// enabled false: Escape still closes it, a tap away does not (a ticket being written).
const native = () => typeof HTMLDialogElement !== "undefined" && "closedBy" in HTMLDialogElement.prototype;

const outside = (e: MouseEvent<HTMLDialogElement>) => {
  if (e.target !== e.currentTarget) return false;
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

let pressedOutside = false;

export function lightDismiss(onClose: () => void, enabled = true) {
  return {
    closedby: enabled ? ("any" as const) : ("closerequest" as const),
    onPointerDown: (e: PointerEvent<HTMLDialogElement>) => { pressedOutside = outside(e); },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (enabled && !native() && pressedOutside && outside(e)) onClose();
      pressedOutside = false;
    },
  };
}
