import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { EPIC_STATUS_LABEL, type Epic } from "@shared/epics.ts";
import { formatDuration, parseDuration, today as todayOf } from "@shared/planning.ts";
import { readShare, type ShareRead } from "@shared/share.ts";
import { normLink } from "@shared/validation.ts";
import { bookmarklet, clearShare, pendingShare, type Pending } from "../lib/share";
import { go } from "../lib/useRoute";
import { PlusIcon } from "./icons";

type Done = { kind: "added" | "already"; title: string } | null;

// Where shares land: what toodoo made of it, as a task to check and add. With nothing shared, how to share.
export function ShareRoom({ offline = false }: { offline?: boolean }) {
  const [shared] = useState<Pending | null>(pendingShare);
  const epics = useQuery(api.epics.list, {});
  const addTasks = useMutation(api.agent.addTasks);
  if (!shared) return <ShareSetup />;
  if (!epics) return <main className="room-main" aria-busy />;
  return <ShareForm shared={shared} epics={epics} offline={offline} add={(tasks) => addTasks({ tasks })} />;
}

const leave = (popup?: boolean) => {
  clearShare();
  if (popup) window.close();
  go("day");
};

type Add = (tasks: unknown[]) => Promise<{ created: unknown[]; errors: { error: string }[] }>;

export function ShareForm({ shared, epics, offline, add }: { shared: Pending; epics: Epic[]; offline: boolean; add: Add }) {
  const today = todayOf();
  const read: ShareRead = useMemo(() => readShare(shared, today, epics), [shared, today, epics]);
  const t = read.task;
  const [f, setF] = useState({
    title: t.title, description: t.description ?? "", link: t.link ?? "", due: t.due ?? "", time: t.time ?? "",
    priority: t.priority ?? "", estimate: t.estimate_mins ? formatDuration(t.estimate_mins) : "", tags: t.tags.join(", "),
    epic: t.epic_id ?? "",
  });
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF((p) => ({ ...p, [k]: e.target.value })); setBad(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) return setBad("Needs a title");
    const est = f.estimate.trim();
    if (est) { const m = parseDuration(est); if (m == null || !Number.isFinite(m) || m < 1 || m > 1440) return setBad("Estimate: like 45m or 1h 30m"); }
    if (f.link.trim() && normLink(f.link) === undefined) return setBad("Link: not a web address");
    setBusy(true);
    try {
      const r = await add([{
          title, description: f.description.trim() || null, link: f.link.trim() || null, due: f.due || null, time: f.time || null,
          priority: f.priority || null, estimate_mins: est || null, tags: f.tags.split(",").map((x) => x.trim()).filter(Boolean),
          epic_id: f.epic || null, source: t.source, external_id: t.external_id,
      }]);
      if (r.errors.length) { setBad(r.errors[0].error); return; }
      setDone({ kind: r.created.length ? "added" : "already", title });
      clearShare();
      if (shared.popup) setTimeout(() => window.close(), 1400);
    } catch (err) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      setBad(msg ? `Couldn't add that: ${msg}` : "Couldn't add that");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="room-main share">
        <div className="share-done" role="status">
          <p className="share-done-head">{done.kind === "added" ? "Added" : "Already on your list"}</p>
          <p className="share-done-title">{done.title.toUpperCase()}</p>
          {!shared.popup && <button type="button" className="room-button" onClick={() => go("day")}>Open toodoo</button>}
        </div>
      </main>
    );
  }

  const open = epics.filter((e) => e.status !== "done");
  return (
    <main className="room-main share">
      <form className="share-form sheet-form" onSubmit={submit}>
        <h1 className="room-title">Add to toodoo</h1>
        {read.found.length > 0 && (
          <ul className="share-found" aria-label="Noticed">
            {read.found.map((x) => <li key={x}>{x}</li>)}
          </ul>
        )}
        <label className="sheet-field"><span>Title</span>
          <input value={f.title} onChange={set("title")} autoComplete="off" autoFocus maxLength={300} aria-invalid={bad === "Needs a title" || undefined} />
        </label>
        <label className="sheet-field"><span>Description</span>
          <textarea rows={4} value={f.description} onChange={set("description")} maxLength={2000} />
        </label>
        <label className="sheet-field"><span>Link</span>
          <input value={f.link} onChange={set("link")} autoComplete="off" inputMode="url" />
        </label>
        <div className="sheet-pair">
          <label className="sheet-field"><span>Date</span><input type="date" value={f.due} onChange={set("due")} /></label>
          <label className="sheet-field"><span>Time</span><input type="time" value={f.time} onChange={set("time")} /></label>
        </div>
        <div className="sheet-pair">
          <label className="sheet-field"><span>Priority</span>
            <select value={f.priority} onChange={set("priority")}>
              <option value="">None</option><option value="high">High</option><option value="med">Medium</option><option value="low">Low</option>
            </select>
          </label>
          <label className="sheet-field"><span>Estimate</span><input value={f.estimate} onChange={set("estimate")} autoComplete="off" /></label>
        </div>
        <div className="sheet-pair">
          <label className="sheet-field"><span>Epic</span>
            <select value={f.epic} onChange={set("epic")}>
              <option value="">None</option>
              {open.map((e) => <option key={e.id} value={e.id}>{e.status === "active" ? e.title : `${e.title} (${EPIC_STATUS_LABEL[e.status].toLowerCase()})`}</option>)}
            </select>
          </label>
          <label className="sheet-field"><span>Tags</span><input value={f.tags} onChange={set("tags")} autoComplete="off" /></label>
        </div>
        {bad && <p className="sheet-error" role="alert">{bad}</p>}
        <div className="sheet-actions">
          <span className="sheet-spacer" />
          <button type="button" className="sheet-cancel" onClick={() => leave(shared.popup)}>Cancel</button>
          <button type="submit" className="sheet-save" disabled={busy || offline}>Add</button>
        </div>
      </form>
    </main>
  );
}

// Nothing shared: the two ways in, and nothing else.
export function ShareSetup() {
  const code = bookmarklet(window.location.origin);
  return (
    <main className="room-main share">
      <div className="share-form">
        <h1 className="room-title">Share to toodoo</h1>
        <p className="share-way"><b>Android</b> Install toodoo from Chrome (⋮ → Add to Home screen → Install). It then shows in every app's Share list.</p>
        <p className="share-way"><b>Chrome</b> Drag this to the bookmarks bar, then press it on any page (a Jira issue, an email, anything). Select some words first to bring them along.</p>
        {/* The link is the bookmarklet: dragged, never followed here. React won't render a javascript: href, so it goes on by hand. */}
        <a className="room-button share-bookmarklet" ref={(a) => a?.setAttribute("href", code)} onClick={(e) => e.preventDefault()}>
          <PlusIcon size={15} /> toodoo
        </a>
      </div>
    </main>
  );
}
