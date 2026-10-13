import type { Modifier } from "@dnd-kit/core";

const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

// A dragged docket or slip stays inside the window: a finger can run off the glass, the paper can't.
export const keepOnScreen: Modifier = ({ transform, draggingNodeRect, windowRect }) => {
  if (!draggingNodeRect || !windowRect) return transform;
  return {
    ...transform,
    x: clamp(transform.x, windowRect.left - draggingNodeRect.left, windowRect.right - draggingNodeRect.right),
    y: clamp(transform.y, windowRect.top - draggingNodeRect.top, windowRect.bottom - draggingNodeRect.bottom),
  };
};
