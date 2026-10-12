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
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const date = board.date;

  useEffect(() => {
    const d = dialog.current!;
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
      if (d.open && typeof d.close === "function") d.close();
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- open once

  const options = useMemo((): Option[] => {
    const planned = new Set(board.blocks.filter((b) => b.date === date).map((b) => b.task_id));
    const open = board.tasks.filter((t) => !t.done && !planned.has(t.id) && !isOptimistic(t.id));
    const byId = new Map(open.map((t) => [t.id, t]));
    const why = new Map(board.suggestions.map((s) => [s.id, s.reasons[0]]));
    const first = board.suggestions.flatMap((s) => (byId.has(s.id) ? [byId.get(s.id)!] : []));
    const rest = open.filter((t) => !why.has(t.id));
    const needle = q.trim().toLowerCase();
    const found = [...first, ...rest]
      .filter((t) => !needle || t.title.toLowerCase().includes(needle))
      .map((t): Option => ({ key: t.id, label: t.title, why: why.get(t.id), task: t }));
    const parsed = parseQuickAdd(q, board.today, board.nowM);
    return parsed.title.trim() ? [...found, { key: "create", label: parsed.title.trim(), create: true }] : found;
  }, [board, date, q]);

  const sel = Math.min(active, Math.max(0, options.length - 1));
  const plannedMins = (t: FullTask) =>
    board.blocks.filter((b) => b.task_id === t.id && b.date !== date).reduce((n, b) => n + b.mins, 0);

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
      style={sheet ? undefined : style}
      aria-label={`Plan ${clock12(toHM(at))}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === dialog.current && sheet && onClose()}
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
      <ul className="slotpick-list" id={`${id}-list`} role="listbox" aria-label="Tasks">
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
