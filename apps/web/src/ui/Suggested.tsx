import { AnimatePresence, m } from "motion/react";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@convex/_generated/api";
import { epicMap } from "@shared/epics.ts";
import { words } from "@shared/inbox.ts";
import { formatDuration } from "@shared/planning.ts";
import type { ToastData } from "../lib/useActions";
import { compactDate } from "./format";
import { OpenIcon } from "./icons";
import { epicStyle } from "./Slip";
import { Toast } from "./Toast";

type Data = NonNullable<ReturnType<typeof useQuery<typeof api.inbox.list>>>;
type Item = Data["items"][number];
type Exit = "accept" | "reject" | "combine";

// Accepted goes up onto the list, rejected slides off aside, combined drops into the task below it.
const CARD = {
  in: { opacity: 0, y: 18, scale: 0.98 },
  at: { opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 },
  out: (how: Exit) =>
    how === "reject" ? { opacity: 0, x: 160, rotate: 4 } : how === "combine" ? { opacity: 0, y: 30, scale: 0.9 } : { opacity: 0, y: -50, rotate: -2 },
};

const failure = (e: unknown, what: string) => {
  const msg = (e as { data?: { message?: string } })?.data?.message;
  return msg ? `${what}: ${msg}` : what;
};

const kicker = (x: Item) =>
  x.source === "jira" ? `JIRA  ${(x.external_id ?? "").replace(/^jira:/, "")}` : x.source === "you" ? "SUGGESTED" : x.source.toUpperCase();

// Suggested: what Claude and the Jira link think Steve should take on. Each waits for a call: Accept (onto the
// list as it is), Combine (into a task he already has, filling its gaps), or Reject (gone, and never proposed again).
export function Suggested({ offline = false }: { offline?: boolean }) {
  const data = useQuery(api.inbox.list, {});
  const [toast, setToast] = useState<ToastData | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<ToastData, "id">) => setToast({ ...t, id: ++seq.current }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const [how, setHow] = useState<Exit>("accept");

  // Each settles at once on screen: the card leaves and the count drops before the server answers.
  const settle = (s: OptimisticLocalStore, id: string) => {
    const cur = s.getQuery(api.inbox.list, {});
    if (cur) s.setQuery(api.inbox.list, {}, { ...cur, items: cur.items.filter((x) => x.id !== id) });
    const n = s.getQuery(api.inbox.count, {});
    if (typeof n === "number") s.setQuery(api.inbox.count, {}, Math.max(0, n - 1));
  };
  const accept = useMutation(api.inbox.acceptOne).withOptimisticUpdate((s, a) => settle(s, a.id));
  const reject = useMutation(api.inbox.rejectOne).withOptimisticUpdate((s, a) => settle(s, a.id));
  const combine = useMutation(api.inbox.combineOne).withOptimisticUpdate((s, a) => settle(s, a.id));
  const undo = useMutation(api.inbox.undoOne);

  const act = (x: Item, kind: Exit, task?: { id: string; title: string }) => {
    if (offline) return;
    setHow(kind);
    const back = () => void undo({ id: x.id }).catch((e) => show({ kind: "error", message: failure(e, "Couldn't undo") }));
    const done = kind === "accept" ? `Added: ${x.title}` : kind === "reject" ? `Rejected: ${x.title}` : `Combined into: ${task!.title}`;
    const p = kind === "accept" ? accept({ id: x.id }) : kind === "reject" ? reject({ id: x.id }) : combine({ id: x.id, task_id: task!.id });
    p.then(() => show({ kind: "undo", message: done, undo: back }))
      .catch((e) => show({ kind: "error", message: failure(e, "Couldn't do that") }));
  };

  const epics = useMemo(() => epicMap(data?.epics ?? []), [data?.epics]);
  return (
    <main className="room-main suggested">
      <h1 className="sr-only">Suggested</h1>
      <JiraLink offline={offline} />
      {!data ? (
        <div className="sug-list" aria-busy>
          {[0, 1].map((i) => <div key={i} className="tidy-card sug-card"><span className="skel skel-line" style={{ width: "30%" }} /><span className="skel skel-line" style={{ width: "80%", height: 26 }} /></div>)}
        </div>
      ) : (
        <ol className="sug-list" aria-label="Suggestions">
          <AnimatePresence mode="popLayout" custom={how} initial={false}>
            {data.items.map((x) => (
              <m.li key={x.id} layout className="tidy-card sug-card" style={epicStyle(x.epic_id ? epics.get(x.epic_id) : undefined)}
                custom={how} variants={CARD} initial="in" animate="at" exit="out" transition={{ type: "spring", stiffness: 420, damping: 36 }}>
                <Card x={x} data={data} epic={x.epic_id ? epics.get(x.epic_id)?.title : undefined} offline={offline}
                  onAccept={() => act(x, "accept")} onReject={() => act(x, "reject")} onCombine={(t) => act(x, "combine", t)} />
              </m.li>
            ))}
          </AnimatePresence>
          {data.items.length === 0 && (
            <m.li key="clear" className="tidy-clear" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="tidy-clear-word">Nothing waiting</p>
            </m.li>
          )}
        </ol>
      )}
      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}

function Card({ x, data, epic, offline, onAccept, onReject, onCombine }: {
  x: Item; data: Data; epic?: string; offline: boolean;
  onAccept: () => void; onReject: () => void; onCombine: (t: { id: string; title: string }) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [more, setMore] = useState(false);
  const today = data.today;
  return (
    <article aria-label={x.title}>
      <p className="tidy-kicker">
        <span>{kicker(x)}</span>
        <span>{x.origin === "jira" ? "FROM JIRA" : "FROM CLAUDE"}</span>
      </p>
      <h2 className="tidy-title sug-title">{x.title}</h2>
      <p className="tidy-meta">
        {epic && <span className="tidy-epic"><span className="stats-dot" aria-hidden />{epic}</span>}
        {x.priority && <span className={x.priority === "high" ? "is-high" : undefined}>{x.priority === "med" ? "medium" : x.priority}</span>}
        {x.status && x.status !== "todo" && <span>{x.status}</span>}
        {x.due && <span className={x.due < today ? "is-high" : undefined}>due {compactDate(x.due)}</span>}
        {x.time && <span>at {x.time}</span>}
        {x.estimate_mins && <span>~{formatDuration(x.estimate_mins)}</span>}
        {x.checklist.length > 0 && <span>{x.checklist.length} {x.checklist.length === 1 ? "step" : "steps"}</span>}
        {x.tags.map((t) => <span key={t}>#{t}</span>)}
        {x.note && <span>{x.note}</span>}
      </p>
      {x.description && (
        <p className={`tidy-desc sug-desc${more ? " is-open" : ""}`} onClick={() => setMore((o) => !o)} title={more ? undefined : "Show all"}>
          {x.description}
        </p>
      )}
      {x.link && (
        <a className="sug-link" href={x.link} target="_blank" rel="noreferrer">
          <OpenIcon size={13} /> {x.source === "jira" ? "Open in Jira" : "Open"}
        </a>
      )}
      {x.alike.length > 0 && !picking && (
        <p className="sug-alike">
          <span className="sug-alike-label">Looks like</span>
          {x.alike.map((a) => (
            <button key={a.id} type="button" className="sug-alike-task" disabled={offline} title={`Combine into “${a.title}”`}
              onClick={() => onCombine(a)}>
              {a.title}
            </button>
          ))}
        </p>
      )}
      {picking ? (
        <Picker x={x} tasks={data.tasks} onPick={onCombine} onClose={() => setPicking(false)} />
      ) : (
        <div className="tidy-keys">
          <button type="button" className="tidy-key is-accept" disabled={offline} onClick={onAccept}>Accept</button>
          <button type="button" className="tidy-key" disabled={offline || data.tasks.length === 0} onClick={() => setPicking(true)}>Combine…</button>
          <button type="button" className="tidy-key is-delete" disabled={offline} onClick={onReject}>Reject</button>
        </div>
      )}
    </article>
  );
}

// Which task to combine into: the lookalikes first, then a search over every open task.
function Picker({ x, tasks, onPick, onClose }: {
  x: Item; tasks: Data["tasks"]; onPick: (t: { id: string; title: string }) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const want = words(q);
    const hits = want.size ? tasks.filter((t) => { const w = words(t.title); return [...want].every((x) => [...w].some((y) => y.startsWith(x))); }) : [];
    const first = x.alike.map((a) => tasks.find((t) => t.id === a.id)).filter((t): t is Data["tasks"][number] => !!t);
    return (q.trim() ? hits : first.length ? first : tasks).slice(0, 8);
  }, [q, tasks, x.alike]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (shown[0]) onPick(shown[0]);
  };
  return (
    <form className="tidy-field sug-pick" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <span className="tidy-input">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Combine into…" aria-label="Find a task to combine into"
          autoComplete="off" spellCheck={false} />
      </span>
      <ul className="sug-pick-list" aria-label="Tasks">
        {shown.map((t) => (
          <li key={t.id}>
            <button type="button" className="sug-pick-task" onClick={() => onPick(t)}>
              {t.title}{t.due && <span className="sug-pick-due">{compactDate(t.due)}</span>}
            </button>
          </li>
        ))}
        {q.trim() && !shown.length && <li className="sug-pick-none">No open task matches</li>}
      </ul>
      <div className="tidy-keys"><button type="button" className="tidy-key is-skip" onClick={onClose}>Cancel</button></div>
    </form>
  );
}

const ago = (t: number) => {
  const mins = Math.round((Date.now() - t) / 60000);
  return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
};
const STUCK_MS = 3 * 60_000;

// The Jira link: every issue its JQL finds (by default, everything open assigned to Steve) waits here, with its
// description, estimate, priority, status and epic carried over. Synced every 15 minutes, or now.
function JiraLink({ offline }: { offline: boolean }) {
  const link = useQuery(api.jira.link, {});
  const save = useMutation(api.jira.save);
  const remove = useMutation(api.jira.remove);
  const syncNow = useMutation(api.jira.syncNow);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ site: "", email: "", token: "", jql: "" });
  const [bad, setBad] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (link === undefined) return <div className="sug-jira" aria-busy />;

  const open = () => {
    setF({ site: link?.site.replace(/^https:\/\//, "") ?? "", email: link?.email ?? "", token: "", jql: link && link.jql !== link.default_jql ? link.jql : "" });
    setBad(null);
    setEditing(true);
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ site: f.site, email: f.email, ...(f.token.trim() ? { token: f.token } : {}), jql: f.jql });
      setEditing(false);
    } catch (err) {
      setBad(failure(err, "Couldn't link that").replace(/^Couldn't link that: /, ""));
    } finally {
      setBusy(false);
    }
  };
  const syncing = !!link?.tried_at && (!link.synced_at || link.tried_at > link.synced_at) && Date.now() - link.tried_at < STUCK_MS && !link.error;

  if (editing) {
    return (
      <form className="sug-jira sug-jira-form sheet-form" onSubmit={submit}>
        <div className="sheet-pair">
          <label className="sheet-field">Site
            <input value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} placeholder="your-team.atlassian.net" autoComplete="off" required />
          </label>
          <label className="sheet-field">Email
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@work.com" autoComplete="off" required />
          </label>
        </div>
        <label className="sheet-field">
          <span>API token <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">make one</a></span>
          <input type="password" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })}
            placeholder={link ? "Leave blank to keep the saved one" : "Paste it here"} autoComplete="off" required={!link} />
        </label>
        <label className="sheet-field">Which issues (JQL)
          <input value={f.jql} onChange={(e) => setF({ ...f, jql: e.target.value })} placeholder={link?.default_jql ?? "assignee = currentUser() AND statusCategory != Done"} autoComplete="off" spellCheck={false} />
        </label>
        {bad && <p className="sheet-error" role="alert">{bad}</p>}
        <div className="sheet-actions">
          {link && <button type="button" className="room-button is-quiet" disabled={offline} onClick={() => { void remove(); setEditing(false); }}>Unlink</button>}
          <span className="sheet-spacer" />
          <button type="button" className="room-button is-quiet" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="room-button" disabled={busy || offline}>{link ? "Save" : "Link Jira"}</button>
        </div>
      </form>
    );
  }
  if (!link) {
    return (
      <p className="sug-jira">
        <span className="sug-jira-name">Jira</span>
        <span className="sug-jira-state">not linked</span>
        <button type="button" className="room-button" disabled={offline} onClick={open}>Link Jira</button>
      </p>
    );
  }
  return (
    <p className="sug-jira">
      <span className="sug-jira-name" title={link.jql}>Jira · {link.site.replace(/^https:\/\//, "")}</span>
      <span className={`sug-jira-state${link.error ? " is-bad" : ""}`}>
        {link.error ?? (syncing ? "syncing…" : link.synced_at ? `${link.count ?? 0} open · synced ${ago(link.synced_at)}` : "waiting to sync")}
      </span>
      <button type="button" className="room-button is-quiet" disabled={offline || syncing} onClick={() => void syncNow()}>Sync now</button>
      <button type="button" className="room-button is-quiet" onClick={open}>Edit</button>
    </p>
  );
}
