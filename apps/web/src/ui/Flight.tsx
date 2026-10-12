import { useLayoutEffect, useRef } from "react";
import { DocketGhost } from "./Docket";
import type { DocketData } from "./types";

type Box = { left: number; top: number; width: number; height: number };

// The shape of a spring as a CSS easing (motion's spring(0.32, 0.22)), for the Web Animations API.
export const SPRING_EASE =
  "linear(0, 0.1017, 0.3081, 0.5244, 0.7063, 0.8401, 0.9286, 0.9809, 1.0077, 1.0183, 1.0197, 1.0168, 1.0125, 1.0084, 1.005, 1.0026, 1.0011, 1.0002, 1, 1)";
const MS = 420;

const toward = (box: Box, at: Box) =>
  `translate(${box.left - at.left}px, ${box.top - at.top}px) scale(${box.width / at.width}, ${box.height / at.height})`;

export type FlightPlan = {
  docket: DocketData;
  compact?: boolean;
  at: Box; // where the picture is drawn at its own size: the docket that was dropped, or the one that was added
  from?: Box; // fly in from here (the quick-add line) to `at`, landing on the target
  target: string; // selector for the element the flight hands over to
};

// A picture of a docket travelling between two places, on top of everything (scroll areas would clip it).
// Into the line: it shrinks into the new block while the block fades in. Out of the quick add: it springs
// from the input to its place in the rail, and the docket there shows the moment it lands.
// Transform and opacity only.
export function Flight({ plan, onDone }: { plan: FlightPlan; onDone: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useLayoutEffect(() => {
    let frame = 0;
    let tries = 0;
    const go = () => {
      const node = el.current;
      const target = document.querySelector<HTMLElement>(plan.target);
      if (!node || typeof node.animate !== "function") return done.current();
      if (!target) {
        if (++tries > 40) return done.current();
        frame = requestAnimationFrame(go);
        return;
      }
      const { at, from } = plan;
      const end = () => done.current();
      if (from) {
        target.animate([{ opacity: 0 }, { opacity: 0 }], { duration: MS });
        node.animate([{ transform: toward(from, at), opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: "none", opacity: 1 }], {
          duration: MS, easing: SPRING_EASE, fill: "forwards",
        }).finished.then(end, end);
      } else {
        const to = target.getBoundingClientRect();
        target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MS * 0.8, delay: MS / 4, fill: "backwards", easing: "ease-out" });
        node.animate([{ transform: "none", opacity: 1 }, { transform: toward(to, at), opacity: 0 }], {
          duration: MS * 0.8, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "forwards",
        }).finished.then(end, end);
      }
    };
    frame = requestAnimationFrame(go);
    return () => cancelAnimationFrame(frame);
  }, [plan]);
  const { at, docket, compact } = plan;
  return (
    <div ref={el} className="dk-morph" aria-hidden style={{ left: at.left, top: at.top, width: at.width, height: at.height }}>
      <DocketGhost docket={docket} compact={compact} />
    </div>
  );
}
