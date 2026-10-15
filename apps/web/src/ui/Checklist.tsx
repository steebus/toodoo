import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
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

// A task's steps: pen boxes that tick, each step retyped where it is printed, and a line at the foot to add one.
// Enter keeps a step and goes on to the next (the add line after the last); pasting several lines adds a step each.
export function Checklist({ items, onChange, disabled, label = "Checklist" }: Props) {
  const [line, setLine] = useState("");
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
  const paste = (e: ClipboardEvent<HTMLInputElement>, at: number) => {
    const text = e.clipboardData.getData("text");
    if (!/\n/.test(text.trim())) return;
    e.preventDefault();
    const steps = pastedSteps(text);
    onChange([...items.slice(0, at), ...steps, ...items.slice(at)].slice(0, MAX));
  };
  const next = (i: number) => {
    const inputs = root.current?.querySelectorAll<HTMLInputElement>(".cl-text, .cl-add");
    inputs?.[i + 1]?.focus();
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
      <ul className="cl-items">
        {items.map((x, i) => (
          <li key={i} className={`cl-item${x.done ? " is-done" : ""}`}>
            <button type="button" className="cl-box" role="checkbox" aria-checked={x.done} aria-label={x.text} disabled={disabled}
              onClick={() => set(i, { done: !x.done })}>
              <PenTick on={x.done} draw className="cl-tick" size={22} />
            </button>
            <Step text={x.text} index={i} disabled={disabled} onSave={(text) => text ? set(i, { text }) : onChange(items.filter((_, k) => k !== i))}
              onNext={() => next(i)} onPaste={(e) => paste(e, i + 1)} />
            <button type="button" className="cl-x" aria-label={`Remove ${x.text || `step ${i + 1}`}`} disabled={disabled}
              onClick={() => onChange(items.filter((_, k) => k !== i))}>
              <CloseIcon size={14} />
            </button>
          </li>
        ))}
      </ul>
      {items.length < MAX && (
        <input className="cl-add" value={line} placeholder="+ Add a step" aria-label="Add a step" maxLength={200} disabled={disabled} enterKeyHint="done"
          onChange={(e) => setLine(e.target.value)} onKeyDown={enter} onBlur={add} onPaste={(e) => paste(e, items.length)} />
      )}
    </div>
  );
}

// One step's words, an input printed as paper: typing stays here until Enter or leaving it keeps it (empty removes
// the step); Escape puts it back.
function Step({ text, index, disabled, onSave, onNext, onPaste }: {
  text: string; index: number; disabled?: boolean; onSave: (text: string) => void; onNext: () => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void;
}) {
  const [draft, setDraft] = useState(text);
  const kept = useRef(text); // Enter keeps, then the blur that follows must not keep (or remove) it again
  useEffect(() => { setDraft(text); kept.current = text; }, [text]);
  const keep = () => {
    const t = draft.trim().slice(0, 200);
    if (t === kept.current) return;
    kept.current = t;
    onSave(t);
  };
  return (
    <input className="cl-text" value={draft} maxLength={200} aria-label={`Step ${index + 1}`} disabled={disabled} enterKeyHint="next"
      onChange={(e) => setDraft(e.target.value)} onBlur={keep} onPaste={onPaste}
      // phone keyboards may send Enter as a line break rather than a key: same thing, and never the browser's own "next field"
      onBeforeInput={(e) => { if ((e.nativeEvent as InputEvent).inputType === "insertLineBreak") { e.preventDefault(); keep(); onNext(); } }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.keyCode === 13) { e.preventDefault(); keep(); onNext(); }
        else if (e.key === "Escape" && draft !== text) { e.preventDefault(); e.stopPropagation(); setDraft(text); }
      }} />
  );
}
