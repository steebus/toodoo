import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { defaultBlockMins, toHM } from "@shared/planning.ts";
import { parseQuickAdd } from "@shared/quickadd.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { isOptimistic, type NewTask } from "../lib/useActions";
import { clock12 } from "./format";
import type { BoardData } from "./types";

type Option = { key: string; label: string; why?: string; create?: true; task?: FullTask };

type Props = {
  at: number; // the slot, in minutes
  board: BoardData;
  style?: CSSProperties; // where the desktop popover sits
  onPick: (task: FullTask, mins: number) => void;
  onCreate: (task: NewTask, mins: number) => void;
  onClose: () => void;
};

const narrow = () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 819px)").matches;

// What goes in an empty slot: suggestions first, then other open tasks, or a new one typed in quick-add grammar.
// A popover beside the slot on desktop, a modal bottom sheet under 820px. Esc closes; focus goes back to the opener.
export function SlotPicker({ at, board, style, onPick, onCreate, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const [sheet] = useState(narrow);
  // True while the effect's own cleanup closes the dialog and hands focus back: that blur is not the user
  // leaving (StrictMode runs the effect, its cleanup, then the effect again on mount).
  const closing = useRef(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const date = board.date;

  useEffect(() => {
    const d = dialog.current!;
    closing.current = false;
    if (sheet && typeof d.showModal === "function") d.showModal();
    else if (!d.open) d.setAttribute("open", "");
    d.scrollIntoView?.({ block: "nearest" });
    d.querySelector<HTMLInputElement>(".slotpick-search")?.focus();
    const away = (e: PointerEvent) => {
      if (!sheet && !d.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      // Back to the opener, unless focus already went somewhere on purpose (Tab out, a click on a control).
      const now = document.activeElement;
      const lost = !now || now === document.body || d.contains(now);
      closing.current = true;
      if (d.open && typeof d.close === "function") d.close();
      const el = opener.current;
      if (lost && el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- open once

  const options = useMemo((): Option[] => {
    // A task can take more than one block a day, so ones already on the line are offered too, after the rest.
    const planned = new Set(board.blocks.filter((b) => b.date === date).map((b) => b.task_id));
    const open = board.tasks.filter((t) => !t.done && !isOptimistic(t.id));
    const byId = new Map(open.map((t) => [t.id, t]));
    const why = new Map(board.suggestions.map((s) => [s.id, s.reasons[0]]));
    const first = board.suggestions.flatMap((s) => (byId.has(s.id) ? [byId.get(s.id)!] : []));
    const rest = open.filter((t) => !why.has(t.id));
    const needle = q.trim().toLowerCase();
    const ranked = [...first, ...rest];
    const found = [...ranked.filter((t) => !planned.has(t.id)), ...ranked.filter((t) => planned.has(t.id))]
      .filter((t) => !needle || t.title.toLowerCase().includes(needle))
      .map((t): Option => ({ key: t.id, label: t.title, why: planned.has(t.id) ? "already on the line" : why.get(t.id), task: t }));
    const parsed = parseQuickAdd(q, board.today, board.nowM);
    return parsed.title.trim() ? [...found, { key: "create", label: parsed.title.trim(), create: true }] : found;
  }, [board, date, q]);

  const sel = Math.min(active, Math.max(0, options.length - 1));
  useEffect(() => {
    dialog.current?.querySelector(`[id="${optId(sel)}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [sel, options.length]); // eslint-disable-line react-hooks/exhaustive-deps -- optId is stable per mount
  // Every block counts toward the estimate, today's too, so another block sizes to what is left: the server's tally
  // over every day where it has one (tasks with an estimate), else the blocks this board carries.
  const plannedMins = (t: FullTask) =>
    board.effort?.[t.id]?.planned ?? board.blocks.filter((b) => b.task_id === t.id).reduce((n, b) => n + b.mins, 0);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    if (o.task) onPick(o.task, defaultBlockMins(o.task, plannedMins(o.task)));
    else {
      const p = parseQuickAdd(q, board.today, board.nowM);
      const t: NewTask = {
        title: p.title.trim(), due: p.due ?? date, time: p.time, priority: p.priority, tags: p.tags,
        estimate_mins: p.estimate_mins, source: "you",
      };
      onCreate(t, defaultBlockMins(t));
    }
    onClose();
  };

  const optId = (i: number) => `${id}-o${i}`;
  return (
    <dialog
      ref={dialog}
      className={`slotpick${sheet ? " is-sheet" : ""}`}
      tabIndex={-1}
      style={sheet ? undefined : style}
      aria-label={`Plan ${clock12(toHM(at))}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && sheet && onClose()}
      onBlur={(e) => {
        // The popover is not modal, so focus leaving it closes it (the sheet traps focus itself).
        if (!sheet && !closing.current && !(e.relatedTarget instanceof Node && dialog.current?.contains(e.relatedTarget))) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="slotpick-at" aria-hidden>{clock12(toHM(at))}</p>
      <input
        className="slotpick-search"
        role="combobox"
        aria-label="Find or create"
        aria-expanded
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={options.length ? optId(sel) : undefined}
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const n = options.length;
            if (n) setActive((sel + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(options[sel]);
          }
        }}
      />
      <ul
        className="slotpick-list" id={`${id}-list`} role="listbox" aria-label="Tasks"
        onMouseDown={(e) => e.preventDefault()} // keep focus in the search while an option is clicked
      >
        {options.map((o, i) => (
          <li
            key={o.key}
            id={optId(i)}
            role="option"
            aria-selected={i === sel}
            className={`slotpick-opt${o.create ? " is-create" : ""}`}
            onPointerMove={() => i !== sel && setActive(i)}
            onClick={() => choose(o)}
          >
            {o.create ? (
              <>
                <span className="slotpick-plus" aria-hidden>+</span>
                <span className="slotpick-title">Create “{o.label}”</span>
              </>
            ) : (
              <>
                <span className="slotpick-title">{o.label}</span>
                {o.why && <span className="slotpick-why">{o.why}</span>}
              </>
            )}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
