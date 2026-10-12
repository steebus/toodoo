import { useEffect } from "react";
import type { ToastData } from "../lib/useActions";

const UNDO_MS = 5000;
const ERROR_MS = 6000;
const RING = 2 * Math.PI * 10;

// One toast at a time. Undo drains a ring over five seconds; an error just goes after six.
export function Toast({ toast, onDismiss }: { toast: ToastData | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDismiss, toast.kind === "undo" ? UNDO_MS : ERROR_MS);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  return (
    <div className="toast-slot" role="status" aria-live="polite">
      {toast && (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <p className="toast-msg">{toast.message}</p>
          {toast.kind === "undo" && toast.undo && (
            <button
              type="button"
              className="toast-undo"
              onClick={() => {
                toast.undo?.();
                onDismiss();
              }}
            >
              <svg className="toast-ring" width="26" height="26" viewBox="0 0 26 26" aria-hidden>
                <circle className="toast-ring-track" cx="13" cy="13" r="10" />
                <circle
                  className="toast-ring-drain"
                  cx="13" cy="13" r="10"
                  strokeDasharray={RING}
                  style={{ ["--ring" as string]: RING, animationDuration: `${UNDO_MS}ms` }}
                />
              </svg>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
