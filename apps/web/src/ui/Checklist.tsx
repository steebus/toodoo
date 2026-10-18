import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import type { ChecklistItem } from "@shared/snapshot.ts";
import { CheckIcon, CloseIcon, CopyIcon, PenTick } from "./icons";

type Props = {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  disabled?: boolean;
  label?: string;
};

const MAX = 50;

// Pasted lines, one step each; "- [x] step" (as Copy writes them) comes back ticked.
export function pastedSteps(text: string): ChecklistItem[] {
  return text.split(/\r?\n/).map((l) => {
    const m = /^\s*(?:[-*•]\s*)?(?:\[( |x|X)\]\s*)?(.*)$/.exec(l)!;
    return { text: m[2].trim().slice(0, 200), done: !!m[1] && m[1] !== " " };
  }).filter((x) => x.text);
}

export const copiedSteps = (items: ChecklistItem[]) => items.map((x) => `- [${x.done ? "x" : " "}] ${x.text}`).join("\n");

// A task's steps: pen boxes that tick, each step retyped where it is printed, a grip on each to drag it elsewhere in
// the list, and a line at the foot to add one. Enter keeps a step and opens a blank one right after it (the add line
// after the last); pasting several lines adds a step each.
export function Checklist({ items, onChange, disabled, label = "Checklist" }: Props) {
  const [line, setLine] = useState("");
  const [blank, setBlank] = useState<number | null>(null); // a new step being typed at this place: only kept once it has words
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((_, i) => `step-${i}`);
  const dropped = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  const root = useRef<HTMLDivElement>(null);
  const set = (i: number, patch: Partial<ChecklistItem>) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const add = () => {
    const text = line.trim();
    if (!text) return;
    onChange([...items, { text: text.slice(0, 200), done: false }]);
    setLine("");
  };
  const enter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.keyCode !== 13) return;
    e.preventDefault(); // inside a form: add a step, don't submit it
    add();
  };
  // Several lines pasted at i (or at the foot): they go in as steps there; one line pastes as text.
  const paste = (e: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, at: number) => {
    const text = e.clipboardData.getData("text");
    if (!/\n/.test(text.trim())) return;
    e.preventDefault();
    const steps = pastedSteps(text);
    onChange([...items.slice(0, at), ...steps, ...items.slice(at)].slice(0, MAX));
  };
  // Enter in step i: a blank step opens after it, unless it is the last (then the add line takes over).
  const next = (i: number) => {
    if (i < items.length - 1 && items.length < MAX) return setBlank(i + 1);
    setBlank(null);
    root.current?.querySelector<HTMLInputElement>(".cl-add")?.focus();
  };
  // The blank step's words arrive: it goes in at its place, and Enter opens another after it.
  const fill = (at: number, text: string, more: boolean) => {
    const t = text.trim().slice(0, 200);
    if (t) onChange([...items.slice(0, at), { text: t, done: false }, ...items.slice(at)]);
    setBlank(t && more && at < items.length && items.length + 1 < MAX ? at + 1 : null);
  };
  const [copied, setCopied] = useState(false);
  const copy = () => void navigator.clipboard?.writeText(copiedSteps(items)).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  });
  const done = items.filter((x) => x.done).length;
  return (
    <div className="checklist" role="group" aria-label={label} ref={root}>
      {items.length > 0 && (
        <p className="cl-count">
          {done}/{items.length}
          <button type="button" className="cl-copy" aria-label={copied ? "Copied" : "Copy checklist"} title="Copy checklist" onClick={copy}>
            {copied ? <CheckIcon size={15} /> : <CopyIcon size={16} />}
          </button>
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setBlank(null)} onDragEnd={dropped}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
          <ul className="cl-items">
            {items.map((x, i) => (
              <Fragment key={ids[i]}>
                {blank === i && <Blank key={`blank-${i}`} index={i} onDone={(t, more) => fill(i, t, more)} />}
                <Row id={ids[i]} item={x} index={blank !== null && blank <= i ? i + 1 : i} disabled={disabled}
                  onTick={() => set(i, { done: !x.done })}
                  onSave={(text) => text ? set(i, { text }) : onChange(items.filter((_, k) => k !== i))}
                  onNext={() => next(i)} onPaste={(e) => paste(e, i + 1)}
                  onRemove={() => onChange(items.filter((_, k) => k !== i))} />
              </Fragment>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {items.length < MAX && (
        <input className="cl-add" value={line} placeholder="+ Add a step" aria-label="Add a step" maxLength={200} disabled={disabled} enterKeyHint="done"
          onChange={(e) => setLine(e.target.value)} onKeyDown={enter} onBlur={add} onPaste={(e) => paste(e, items.length)} />
      )}
    </div>
  );
}

// One step as printed: grip, box, words, cross. The grip is the drag handle (mouse, touch, or Space and arrows).
function Row({ id, item: x, index: i, disabled, onTick, onSave, onNext, onPaste, onRemove }: {
  id: string; item: ChecklistItem; index: number; disabled?: boolean; onTick: () => void; onSave: (text: string) => void;
  onNext: () => void; onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <li ref={setNodeRef} className={`cl-item${x.done ? " is-done" : ""}${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} className="cl-grip" aria-label={`Move ${x.text || `step ${i + 1}`}`} disabled={disabled}
        {...attributes} {...listeners}>
        <GripIcon />
      </button>
      <button type="button" className="cl-box" role="checkbox" aria-checked={x.done} aria-label={x.text} disabled={disabled} onClick={onTick}>
        <PenTick on={x.done} draw className="cl-tick" size={22} />
      </button>
      <Step text={x.text} index={i} disabled={disabled} onSave={onSave} onNext={onNext} onPaste={onPaste} />
      <button type="button" className="cl-x" aria-label={`Remove ${x.text || `step ${i + 1}`}`} disabled={disabled} onClick={onRemove}>
        <CloseIcon size={14} />
      </button>
    </li>
  );
}

// A step's words wrap: the box grows to fit its lines, again whenever the list's width changes.
function useGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => { el.style.height = "auto"; el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`; };
    fit();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(el.parentElement ?? el);
    return () => ro?.disconnect();
  }, [value]);
  return ref;
}

const GripIcon = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden focusable="false">
    {[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
  </svg>
);

// The step just opened by Enter: nothing is kept until it has words; Enter keeps them and opens the next, leaving
// it empty (or Escape) drops it.
function Blank({ index, onDone }: { index: number; onDone: (text: string, more: boolean) => void }) {
  const [draft, setDraft] = useState("");
  const settled = useRef(false);
  const grow = useGrow(draft);
  const settle = (more: boolean) => {
    if (settled.current) return;
    settled.current = true;
    onDone(draft, more);
  };
  return (
    <li className="cl-item is-blank">
      <span className="cl-grip is-idle" aria-hidden><GripIcon /></span>
      <span className="cl-box is-idle" aria-hidden />
      <textarea ref={grow} className="cl-text" rows={1} value={draft} maxLength={200} aria-label={`Step ${index + 1}`} placeholder="New step" autoFocus enterKeyHint="next"
        onChange={(e) => setDraft(e.target.value)} onBlur={() => settle(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); settle(true); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDraft(""); settled.current = true; onDone("", false); }
        }} />
    </li>
  );
}

// One step's words, a box printed as paper that wraps onto more lines: typing stays here until Enter or leaving it keeps it (empty removes
// the step); Escape puts it back.
function Step({ text, index, disabled, onSave, onNext, onPaste }: {
  text: string; index: number; disabled?: boolean; onSave: (text: string) => void; onNext: () => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const [draft, setDraft] = useState(text);
  const grow = useGrow(draft);
  const kept = useRef(text); // Enter keeps, then the blur that follows must not keep (or remove) it again
  useEffect(() => { setDraft(text); kept.current = text; }, [text]);
  const keep = () => {
    const t = draft.trim().slice(0, 200);
    if (t === kept.current) return;
    kept.current = t;
    onSave(t);
  };
  return (
    <textarea ref={grow} className="cl-text" rows={1} value={draft} maxLength={200} aria-label={`Step ${index + 1}`} disabled={disabled} enterKeyHint="next"
      onChange={(e) => setDraft(e.target.value)} onBlur={keep} onPaste={onPaste}
      // phone keyboards may send Enter as a line break rather than a key: same thing, and never the browser's own "next field"
      onBeforeInput={(e) => { if ((e.nativeEvent as InputEvent).inputType === "insertLineBreak") { e.preventDefault(); keep(); onNext(); } }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); keep(); onNext(); }
        else if (e.key === "Escape" && draft !== text) { e.preventDefault(); e.stopPropagation(); setDraft(text); }
      }} />
  );
}
