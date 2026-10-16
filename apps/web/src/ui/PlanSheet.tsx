import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { DEFAULT_VIEW } from "@shared/board.ts";
import { useActions } from "../lib/useActions";
import { useBoard } from "../lib/useBoard";
import { buildPass } from "./build";
import { DayPlan } from "./DayPlan";
import { DndProvider } from "./DndProvider";
import { longDate } from "./format";
import { CloseIcon } from "./icons";
import { Toast } from "./Toast";

// The Day's planner for one day, in a modal over the Calendar: the line with Next up and Auto plan, as on the Day.
// A frame of its own (a .pass, split all the way across) so the planner lays out as it does there.
export function PlanSheet({ date, onOpen, onClose }: { date: string; onOpen?: (id: string) => void; onClose: () => void }) {
  const { user } = useAuth();
  const board = useBoard(date, user?.id);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    return () => {
      if (d.open && typeof d.close === "function") d.close();
    };
  }, []);
  return (
    <dialog ref={dialog} className="sheet plansheet" aria-label={`Plan ${longDate(date)}`}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="plansheet-head">
        <h2 className="plansheet-title">Plan · {longDate(date)}</h2>
        <button type="button" className="plansheet-x" aria-label="Close" onClick={onClose}><CloseIcon size={16} /></button>
      </div>
      {board?.date === date ? <Planner board={board} onOpen={onOpen} /> : <div className="plansheet-frame is-loading" aria-busy />}
    </dialog>
  );
}

function Planner({ board, onOpen }: { board: NonNullable<ReturnType<typeof useBoard>>; onOpen?: (id: string) => void }) {
  const actions = useActions(board);
  const { plan, nextUp } = useMemo(() => buildPass(board, DEFAULT_VIEW), [board]);
  return (
    <div className="pass plansheet-frame" data-tab="plan" data-offline={actions.offline || undefined}>
      <DndProvider board={board} groups={[]} manual={false} actions={actions}>
        <main className="pass-main" style={{ "--split": 100 } as CSSProperties}>
          <DayPlan plan={plan} board={board} actions={actions}
            nextUp={{ items: nextUp, onOpen, autoPlan: !actions.offline ? { date: board.date, today: board.today } : undefined }} />
        </main>
      </DndProvider>
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </div>
  );
}
