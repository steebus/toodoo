import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

type Note = { id: string; parent_id: string | null; author: "steve" | "claude"; text: string; created_at: number };
type Props = { taskId: string; legacy?: string | null; disabled?: boolean };

const when = (ms: number) => new Date(ms).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// A task's notes, as comments: each can be replied to, one level deep. A note from before threads shows as the
// first comment until something is added.
export function Notes({ taskId, legacy = null, disabled = false }: Props) {
  const found = useQuery(api.notes.list, { task_id: taskId });
  const rows: Note[] = Array.isArray(found) ? found : [];
  const add = useMutation(api.notes.add);
  const remove = useMutation(api.notes.remove);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [fresh, setFresh] = useState("");
  const [problem, setProblem] = useState(false);

  const shown: Note[] = rows.length || !legacy ? rows : [{ id: "legacy", parent_id: null, author: "steve", text: legacy, created_at: 0 }];
  const tops = shown.filter((n) => !n.parent_id);

  const send = async (text: string, parent_id: string | null) => {
    if (!text.trim() || disabled) return false;
    setProblem(false);
    try {
      await add({ task_id: taskId, text: text.trim(), ...(parent_id && parent_id !== "legacy" ? { parent_id } : {}) });
      return true;
    } catch {
      setProblem(true);
      return false;
    }
  };

  const box = (value: string, set: (v: string) => void, done: () => void, label: string, autoFocus = false) => (
    <form className="tk-note-form" onSubmit={async (e) => { e.preventDefault(); if (await send(value, label === "Reply" ? replyTo : null)) { set(""); done(); } }}>
      <textarea value={value} rows={1} aria-label={label} placeholder={label === "Reply" ? "Reply" : "+ Note"} autoFocus={autoFocus} disabled={disabled}
        maxLength={2000} onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
          if (e.key === "Escape" && label === "Reply") { e.stopPropagation(); set(""); done(); }
        }} />
      {value.trim() && <button type="submit" className="tk-act" disabled={disabled}>{label === "Reply" ? "Reply" : "Add"}</button>}
    </form>
  );

  const item = (n: Note, reply: boolean) => (
    <li key={n.id} className={`tk-note-item${reply ? " is-reply" : ""}`} data-author={n.author}>
      <p className="tk-note-meta">{n.author === "claude" ? "CLAUDE" : "STEVE"}{n.created_at ? ` · ${when(n.created_at)}` : ""}</p>
      <p className="tk-note-text">{n.text}</p>
      <span className="tk-note-acts">
        {!reply && <button type="button" className="tk-note-act" disabled={disabled} onClick={() => { setReplyTo(n.id); setDraft(""); }}>Reply</button>}
        {n.id !== "legacy" && <button type="button" className="tk-note-act" disabled={disabled} onClick={() => void remove({ id: n.id })}>Delete</button>}
      </span>
    </li>
  );

  return (
    <section className="tk-notes" aria-label="Notes">
      {tops.length > 0 && (
        <ul className="tk-note-list">
          {tops.map((n) => (
            <li key={n.id} className="tk-note-thread">
              <ul>
                {item(n, false)}
                {shown.filter((r) => r.parent_id === n.id).map((r) => item(r, true))}
                {replyTo === n.id && <li className="tk-note-item is-reply">{box(draft, setDraft, () => setReplyTo(null), "Reply", true)}</li>}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {box(fresh, setFresh, () => {}, "Note")}
      {problem && <p role="alert" className="tk-note-problem">Not saved</p>}
    </section>
  );
}
