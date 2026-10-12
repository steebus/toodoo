import { useEffect, useRef } from "react";

const KEYS: [string[], string][] = [
  [["n"], "Add"],
  [["j", "k"], "Next, previous"],
  [["x"], "Tick"],
  [["e"], "Edit"],
  [["p"], "Plan"],
  [["[", "]"], "Previous, next day"],
  [["t"], "Today"],
  [["1", "2", "3"], "Capture, Plan, Focus"],
  [["?"], "Shortcuts"],
];

// A native modal dialog, like the edit sheet; focus returns to where it was.
export function HelpSheet({ onClose }: { onClose: () => void }) {
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
          {KEYS.map(([keys, what]) => (
            <div key={what} style={{ display: "contents" }}>
              <dt>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </dialog>
  );
}
