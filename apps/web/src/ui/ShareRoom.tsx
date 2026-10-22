import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { EPIC_STATUS_LABEL, type Epic } from "@shared/epics.ts";
import { formatDuration, nowMin, parseDuration, today as todayOf } from "@shared/planning.ts";
import { readShare, type ShareRead } from "@shared/share.ts";
import { fileKind, isPicture } from "@shared/attachments.ts";
import { normLink } from "@shared/validation.ts";
import { bookmarklet, clearShare, pendingShare, sharedFiles, type Pending } from "../lib/share";
import { useAttach } from "../lib/upload";
import { go } from "../lib/useRoute";
import { PlusIcon } from "./icons";
import { Paperclip } from "./Paperclip";
import { QuickAdd } from "./QuickAdd";

type Done = { kind: "added" | "already" | "attached"; title: string; files: number; problems: string[] } | null;
type Pick = { id: string; title: string; due: string | null };

// Where shares land: what toodoo made of it, as a task to check and add, or (pictures and files shared) the files
// onto a task already there. With nothing shared, how to share.
export function ShareRoom({ offline = false }: { offline?: boolean }) {
  const [shared] = useState<Pending | null>(pendingShare);
  const [files, setFiles] = useState<File[] | null>(shared?.files ? null : []);
  useEffect(() => { if (shared?.files) void sharedFiles(shared.files).then(setFiles); }, [shared]);
  const epics = useQuery(api.epics.list, {});
  const work = useQuery(api.epics.workspace, files?.length ? {} : "skip"); // the open tasks, to put the files on one
  const addTasks = useMutation(api.agent.addTasks);
  const attach = useAttach();
  if (!shared) return <ShareSetup />;
  if (!epics || files === null) return <main className="room-main" aria-busy />;
  const tasks = work?.tasks.filter((t) => !t.done).map((t) => ({ id: t.id, title: t.title, due: t.due }));
  return (
    <ShareForm shared={shared} epics={epics} offline={offline} add={(tasks) => addTasks({ tasks })} files={files} tasks={tasks}
      attach={async (id, fs) => {
        const problems: string[] = [];
        for (const f of fs) { const bad = await attach(id, f); if (bad) problems.push(bad); }
        return problems;
      }} />
  );
}

const leave = (popup?: boolean) => {
  clearShare();
  if (popup) window.close();
  go("day");
};

type Add = (tasks: unknown[]) => Promise<{ created: { id?: string }[]; skipped?: { id?: string }[]; errors: { error: string }[] }>;
type AttachAll = (taskId: string, files: File[]) => Promise<string[]>; // what went wrong, file by file

type FormProps = {
  shared: Pending; epics: Epic[]; offline: boolean; add: Add;
  files?: File[]; tasks?: Pick[]; attach?: AttachAll; // shared files: onto the new task, or onto one picked from tasks
};

export function ShareForm({ shared, epics, offline, add, files = [], tasks, attach }: FormProps) {
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
  const [mode, setMode] = useState<"new" | "existing">("new");
  const finish = (d: NonNullable<Done>) => {
    setDone(d);
    clearShare();
    if (shared.popup) setTimeout(() => window.close(), 1400);
  };
  useEffect(() => { // a picture to file: straight to the add line
    if (files.length && mode === "new") document.querySelector<HTMLInputElement>(".share-quick .quickadd-input")?.focus();
  }, [files.length, mode]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF((p) => ({ ...p, [k]: e.target.value })); setBad(null); };

  // Files the task (and the shared files onto it, or onto the one already there: the same Jira issue shared again).
  // False, with why, when it isn't filed.
  const file = async (row: Record<string, unknown>, title: string) => {
    setBad(null);
    try {
      const r = await add([row]);
      if (r.errors.length) { setBad(r.errors[0].error); return false; }
      const id = r.created[0]?.id ?? r.skipped?.[0]?.id;
      const problems = files.length && id && attach ? await attach(id, files) : [];
      finish({ kind: r.created.length ? "added" : "already", title, files: files.length - problems.length, problems });
      return true;
    } catch (err) {
      const msg = (err as { data?: { message?: string } })?.data?.message;
      setBad(msg ? `Couldn't add that: ${msg}` : "Couldn't add that");
      return false;
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) return setBad("Needs a title");
    const est = f.estimate.trim();
    if (est) { const m = parseDuration(est); if (m == null || !Number.isFinite(m) || m < 1 || m > 1440) return setBad("Estimate: like 45m or 1h 30m"); }
    if (f.link.trim() && normLink(f.link) === undefined) return setBad("Link: not a web address");
    setBusy(true);
    await file({
      title, description: f.description.trim() || null, link: f.link.trim() || null, due: f.due || null, time: f.time || null,
      priority: f.priority || null, estimate_mins: est || null, tags: f.tags.split(",").map((x) => x.trim()).filter(Boolean),
      epic_id: f.epic || null, source: t.source, external_id: t.external_id,
    }, title);
    setBusy(false);
  };

  if (done) {
    return (
      <main className="room-main share">
        <div className="share-done" role="status">
          {done.files > 0 && <AttachAnim files={files.slice(0, 3)} title={done.title} />}
          <p className="share-done-head">{done.kind === "added" ? "Added" : done.kind === "attached" ? "Attached to" : "Already on your list"}</p>
          <p className="share-done-title">{done.title.toUpperCase()}</p>
          {done.files > 0 && done.kind !== "attached" && <p className="share-done-files">with {filesWord(done.files)}</p>}
          {done.kind === "attached" && <p className="share-done-files">{filesWord(done.files)}</p>}
          {done.problems.map((x) => <p key={x} className="sheet-error" role="alert">{x}</p>)}
          {!shared.popup && <button type="button" className="room-button" onClick={() => go("day")}>Open toodoo</button>}
        </div>
      </main>
    );
  }

  const open = epics.filter((e) => e.status !== "done");
  const toExisting = files.length > 0 && mode === "existing";
  return (
    <main className="room-main share">
      {files.length > 0 && <SharedFiles files={files} />}
      {files.length > 0 && (
        <div className="share-mode" role="group" aria-label="Where it goes">
          <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")}>New task</button>
          <button type="button" aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>Add to a task</button>
        </div>
      )}
      {toExisting ? (
        <TaskPick tasks={tasks} offline={offline} files={files.length} onCancel={() => leave(shared.popup)} onPick={async (t) => {
          const problems = attach ? await attach(t.id, files) : [];
          if (problems.length === files.length) return problems; // nothing went on: stay, and say why
          finish({ kind: "attached", title: t.title, files: files.length - problems.length, problems });
          return [];
        }} />
      ) : files.length > 0 ? (
        // A picture shared to a new task: the add line and its dials, as on the phone, with whatever words came too.
        <div className="share-form share-quick quickadd-roomy">
          <h1 className="room-title">New task</h1>
          <QuickAdd today={today} nowM={nowMin(new Date())} initial={t.title ? `${t.title} ` : ""} epics={open} tools disabled={offline}
            onAdd={(q, line) => file({ ...q, link: t.link, description: t.description, source: t.source, external_id: t.external_id }, q.title || line)} />
          {bad && <p className="sheet-error" role="alert">{bad}</p>}
          <div className="sheet-actions">
            <span className="sheet-spacer" />
            <button type="button" className="sheet-cancel" onClick={() => leave(shared.popup)}>Cancel</button>
          </div>
        </div>
      ) : (
      <form className="share-form sheet-form" onSubmit={submit}>
        <h1 className="room-title">Add to toodoo</h1>
        {read.found.length > 0 && (
          <ul className="share-found" aria-label="Noticed">
            {read.found.map((x) => <li key={x}>{x}</li>)}
          </ul>
        )}
        <label className="sheet-field"><span>Title</span>
          <input value={f.title} onChange={set("title")} autoComplete="off" autoFocus maxLength={300} aria-invalid={bad === "Needs a title" || undefined}
            placeholder={files.length ? "What's this for?" : undefined} />
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
      )}
    </main>
  );
}

const filesWord = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;

// A picture's address to show it by while it's here (none for other files); let go of on the way out.
function usePictureUrls(files: File[]) {
  const urls = useMemo(() => files.map((f) => (isPicture(f) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  return urls;
}

// Filed: the pictures drop onto a ticket one after another and a paperclip snaps on over them.
function AttachAnim({ files, title }: { files: File[]; title: string }) {
  const urls = usePictureUrls(files);
  return (
    <div className="aa" aria-hidden style={{ ["--n" as string]: files.length }}>
      <div className="aa-ticket">
        <span className="aa-dashes" />
        <span className="aa-title">{title.toUpperCase()}</span>
      </div>
      {files.map((f, i) => (
        <span key={i} className="aa-photo" style={{ ["--i" as string]: i }}>
          {urls[i] ? <img src={urls[i]!} alt="" /> : <b>{fileKind(f.name)}</b>}
        </span>
      ))}
      <Paperclip className="aa-clip" />
    </div>
  );
}

// What was shared, as it will go on: pictures as thumbnails, other files as their kind and name.
function SharedFiles({ files }: { files: File[] }) {
  const urls = usePictureUrls(files);
  return (
    <ul className="share-files" aria-label="Shared files">
      {files.map((f, i) => (
        <li key={i} className="share-file">
          {urls[i] ? <img src={urls[i]!} alt={f.name} /> : <span className="share-file-kind" title={f.name}>{fileKind(f.name)}<small>{f.name}</small></span>}
        </li>
      ))}
    </ul>
  );
}

// An open task to put the files on: found by typing a few of its words, picked with a tap.
function TaskPick({ tasks, offline, files, onPick, onCancel }: {
  tasks?: Pick[]; offline: boolean; files: number; onPick: (t: Pick) => Promise<string[]>; onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found = (tasks ?? [])
    .filter((t) => words.every((w) => t.title.toLowerCase().includes(w)))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title))
    .slice(0, 30);
  return (
    <div className="share-form sheet-form share-pick">
      <h1 className="room-title">Add to a task</h1>
      <label className="sheet-field"><span>Find a task</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus placeholder="A few words of its title" />
      </label>
      {!tasks ? <p className="share-pick-none" aria-busy>Loading your tasks…</p> : found.length ? (
        <ul className="share-pick-list" aria-label="Open tasks">
          {found.map((t) => (
            <li key={t.id}>
              <button type="button" className="share-pick-task" disabled={offline || busy !== null} aria-busy={busy === t.id || undefined}
                onClick={async () => { setBusy(t.id); setProblems(await onPick(t)); setBusy(null); }}>
                <span>{t.title.toUpperCase()}</span>
                <span className="share-pick-go">{busy === t.id ? "ATTACHING…" : `+ ${filesWord(files).toUpperCase()}`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="share-pick-none">{tasks.length ? "No open task has those words" : "No open tasks"}</p>}
      {problems.map((x) => <p key={x} className="sheet-error" role="alert">{x}</p>)}
      <div className="sheet-actions">
        <span className="sheet-spacer" />
        <button type="button" className="sheet-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
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
