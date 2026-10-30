import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@workos-inc/authkit-react";
import { actionFor } from "../lib/shortcuts";
import { useActions } from "../lib/useActions";
import { useBoard } from "../lib/useBoard";
import type { Room } from "../lib/useRoute";
import { HelpSheet } from "./HelpSheet";
import { QuickAdd } from "./QuickAdd";

// The keys every room shares, for the rooms that don't have the Day's own (it keeps its handler): n focuses the page's
// add line, or opens one in a drawer from the bottom when the page has none; ? lists what this page answers to.
// On window, so a room's own handler on the document gets the key first.
export function GlobalKeys({ room }: { room: Room }) {
  const [adding, setAdding] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || room === "tidy") return;
      const a = actionFor(e);
      if (a === "add") {
        const line = document.querySelector<HTMLElement>(".quickadd-input");
        if (line) line.focus();
        else setAdding(true);
      } else if (a === "help") setHelp(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room]);
  return (
    <>
      {adding && <AddDrawer onClose={() => setAdding(false)} />}
      {help && <HelpSheet room={room} onClose={() => setHelp(false)} />}
    </>
  );
}

// A quick add in a bottom drawer: Enter files the line and the drawer goes; Escape or a click outside closes it.
function AddDrawer({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const board = useBoard(undefined, user?.id);
  if (!board) return null;
  return <Drawer board={board} onClose={onClose} />;
}

function Drawer({ board, onClose }: { board: NonNullable<ReturnType<typeof useBoard>>; onClose: () => void }) {
  const actions = useActions(board);
  const dialog = useRef<HTMLDialogElement>(null);
  const tags = useMemo(() => [...new Set(board.tasks.flatMap((t) => t.tags))].sort(), [board.tasks]);
  useEffect(() => {
    const d = dialog.current!;
    const opener = document.activeElement;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    d.querySelector<HTMLInputElement>(".quickadd-input")?.focus();
    return () => {
      if (d.open && typeof d.close === "function") d.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className="sheet addsheet addrawer quickadd-roomy" aria-label="Add a to do"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => e.target === dialog.current && onClose()}>
      <QuickAdd today={board.today} nowM={board.nowM} epics={board.epics} tags={tags} disabled={actions.offline}
        onAdd={(t) => { onClose(); return actions.add(t); }}
        onPlace={(t, date, start, mins) => { onClose(); return actions.addAndPlace(t, date, start, mins); }} />
    </dialog>
  );
}
