import { useEffect, useRef } from "react";
import type { Room } from "../lib/useRoute";

// Where each applies: the rooms, add and this list work on every page, the presets and Focus on every room but the
// Day (where they are the Day's own, listed all the same); the ticket keys only on the Day.
type Where = "all" | "day";
const KEYS: [string[], string, Where][] = [
  [["d", "k", "e", "m"], "Day, Kanban, Epics, Matrix", "all"],
  [["p", "c"], "Plan, Capture", "all"],
  [["f"], "Focus on the task in hand", "all"],
  [["n"], "Add", "all"],
  [["j", "↑"], "Next, previous ticket", "day"],
  [["x"], "Tick the ticket", "day"],
  [["p"], "Put the ticket on the plan", "day"],
  [["r"], "Rename the ticket", "day"],
  [["[", "]"], "Previous, next day", "day"],
  [["t"], "Today", "day"],
  [["?"], "Shortcuts", "all"],
];

// A native modal dialog, like the edit sheet; focus returns to where it was.
export function HelpSheet({ onClose, room = "day" }: { onClose: () => void; room?: Room }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    const opener = document.activeElement;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    return () => {
      if (d.open && typeof d.close === "function") d.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog} className="sheet" aria-labelledby="help-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && onClose()}
    >
      <div className="sheet-form">
        <h2 id="help-title" className="sheet-title">Shortcuts</h2>
        <dl className="help-list">
          {KEYS.filter(([, , where]) => where !== "day" || room === "day").map(([keys, what]) => (
            <div key={what + keys} style={{ display: "contents" }}>
              <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}
