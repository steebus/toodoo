import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { BoardData } from "../ui/types";

type VT = { startViewTransition?: (cb: () => void) => unknown };

// Holds the day on screen while the next one loads, then swaps it in a View Transition that slides
// the way you travelled (see .plan-scroll in pass.css). Without the API the swap is instant.
export function useDayChange(board: BoardData | undefined): BoardData | undefined {
  const [shownDate, setShownDate] = useState(board?.date);
  const last = useRef(board);
  if (board && (shownDate === undefined || board.date === shownDate)) last.current = board;

  useEffect(() => {
    if (!board || board.date === shownDate) return;
    const from = shownDate;
    const doc = document as Document & VT;
    if (!from || typeof doc.startViewTransition !== "function") return setShownDate(board.date);
    document.documentElement.dataset.dayDir = board.date > from ? "next" : "prev";
    doc.startViewTransition(() => flushSync(() => setShownDate(board.date)));
  }, [board, shownDate]);

  return last.current;
}
