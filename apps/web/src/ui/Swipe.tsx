import { animate, m, useMotionValue, useTransform, type PanInfo } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buzz, SWIPE, swipeEnd } from "../lib/swipe";
import { CheckIcon } from "./icons";
import { reducedMotion, SNAPPY } from "./motion";

type Props = {
  held: boolean; // dnd-kit has it (a stationary long press): the paper stays put
  disabled: boolean;
  onTick: () => void;
  onPlan?: () => void;
  onTomorrow?: () => void;
  children: ReactNode;
};

// A docket on the phone. Swipe right and it is bumped; swipe left and it slides aside to show Plan and
// Tomorrow; let go short of either and it springs back. Under the paper: the bump tick and the two actions,
// fading up as the paper uncovers them.
export function Swipe({ held, disabled, onTick, onPlan, onTomorrow, children }: Props) {
  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const moved = useRef(0);
  const bump = useTransform(x, [12, SWIPE.tick], [0, 1]);
  const acts = useTransform(x, [-SWIPE.rest, -24, 0], [1, 0.2, 0]);
  const go = (to: number) => animate(x, to, reducedMotion() ? { duration: 0 } : SNAPPY);
  const close = () => {
    setOpen(false);
    go(0);
  };
  const end = (_: unknown, info: PanInfo) => {
    moved.current = Date.now();
    const r = held ? "close" : swipeEnd(x.get(), info.velocity.x);
    if (r === "tick") {
      buzz(12);
      close();
      onTick();
    } else if (r === "open" && (onPlan || onTomorrow)) {
      buzz(6);
      setOpen(true);
      go(-SWIPE.rest);
    } else close();
  };
  // Gone offline (or busy) while it was aside: the actions are no longer allowed, so the paper goes back.
  useEffect(() => {
    if (disabled && open) close();
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps -- only when it becomes disabled
  const act = (fn: () => void) => () => {
    close();
    fn();
  };
  return (
    <>
      <div className="dk-under">
        <m.span className="dk-under-bump" style={{ opacity: bump }} aria-hidden>
          <CheckIcon size={22} />
        </m.span>
        <m.span className="dk-under-acts" style={{ opacity: acts }} inert={!open}>
          {onPlan && <button type="button" className="dk-act" onClick={act(onPlan)}>Plan</button>}
          {onTomorrow && <button type="button" className="dk-act" onClick={act(onTomorrow)}>Tomorrow</button>}
        </m.span>
      </div>
      <m.div
        className="dk-swipe"
        style={{ x }}
        drag={held || disabled ? false : "x"}
        dragDirectionLock
        dragMomentum={false}
        onDragStart={() => (moved.current = Date.now())}
        onDragEnd={end}
        onClickCapture={(e) => {
          // A tap on the paper while it is aside puts it back; the click a swipe ends with is not a tap.
          if (!open && Date.now() - moved.current > 250) return;
          e.preventDefault();
          e.stopPropagation();
          if (open) close();
        }}
      >
        {children}
      </m.div>
    </>
  );
}
