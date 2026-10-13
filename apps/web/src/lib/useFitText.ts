import { useLayoutEffect, type RefObject } from "react";

// Shrinks an element's text until it fits its box (wrapping as it likes), never below `floor` of its CSS size.
// Only for a box with a fixed size: a box that grows with its text (the phone's header) is left alone.
export function useFitText(ref: RefObject<HTMLElement | null>, text: string, floor = 0.45) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      if (getComputedStyle(el).position !== "absolute") return;
      const max = parseFloat(getComputedStyle(el).fontSize);
      let size = max;
      const over = () => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
      while (over() && size > max * floor) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [ref, text, floor]);
}
