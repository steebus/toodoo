import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { defaultBlockMins, timedEvents, toHM, toMin } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { clock12 } from "./format";
import type { BoardData } from "./types";

const FIRST = 6 * 60; // the line's first and last half hour
const LAST = 21 * 60 + 30;
const HALVES = Array.from({ length: (LAST - FIRST) / 30 + 1 }, (_, i) => FIRST + i * 30);

const ampm = (m: number) => `${clock12(toHM(m))}${m >= 720 ? "pm" : "am"}`;

// Plan it, minimally: a day, a half hour, and what is already there. "Next free slot" is the old Plan it.
export function PlanIt({ task, today, onNextFree, onClose }: { task: FullTask; today: string; onNextFree?: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(today);
  const [at, setAt] = useState<number | null>(null);
  const [bad, setBad] = useState("");
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  const board = useQuery(api.agent.board, { date, now }) as BoardData | undefined;
  const place = useMutation(api.agent.placeBlock);

  useEffect(() => {
    const d = dialog.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    return () => {
      if (d.open && typeof d.close === "function") d.close();
    };
  }, []);

  // Today opens on the next half hour, any other day on nine.
  const start = at ?? (date === today && board?.date === date ? Math.min(LAST, Math.max(FIRST, Math.ceil((board.nowM + 1) / 30) * 30)) : 9 * 60);
  const mins = defaultBlockMins(task, board?.effort?.[task.id]?.planned ?? 0);
  const clashes = useMemo(() => {
    if (!board || board.date !== date) return null;
    const titles = new Map(board.tasks.map((t) => [t.id, t.title]));
    const events = timedEvents(board.day?.events ?? []).map((e) => ({ s: e.s, e: e.e, title: e.title }));
    const blocks = board.blocks.filter((b) => b.date === date).map((b) => ({ s: toMin(b.start) ?? 0, e: (toMin(b.start) ?? 0) + b.mins, title: titles.get(b.task_id) ?? "Planned" }));
    return [...events, ...blocks].filter((x) => x.s < start + mins && x.e > start).sort((a, b) => a.s - b.s);
  }, [board, date, start, mins]);

  const submit = async () => {
    setBusy(true);
    setBad("");
    try {
      await place({ task_id: task.id, date, start: toHM(start), mins });
      onClose();
    } catch {
      setBad("Couldn't plan that");
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="planit" aria-label="Plan it"
      onCancel={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
      onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="planit-body">
        <div className="sheet-pair">
          <label className="sheet-field"><span>Date</span>
            <input type="date" value={date} onChange={(e) => e.target.value && (setDate(e.target.value), setAt(null))} />
          </label>
          <label className="sheet-field"><span>Time</span>
            <select value={start} onChange={(e) => setAt(Number(e.target.value))}>
              {HALVES.map((m) => <option key={m} value={m}>{ampm(m)}</option>)}
            </select>
          </label>
        </div>
        <p className="planit-clash" role="status" aria-live="polite">
          {clashes === null ? " " : clashes.length ? clashes.map((c) => `${clock12(toHM(c.s))}–${clock12(toHM(c.e))} ${c.title}`).join(" · ") : "Free"}
        </p>
        {bad && <p className="sheet-error" role="alert">{bad}</p>}
        <div className="sheet-actions">
          {onNextFree && date === today && <button type="button" onClick={() => { onNextFree(); onClose(); }}>Next free slot</button>}
          <span className="sheet-spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="sheet-save" disabled={busy} onClick={submit}>Plan</button>
        </div>
      </div>
    </dialog>
  );
}
